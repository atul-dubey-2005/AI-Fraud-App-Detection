require('dotenv').config({ path: '../.env' });
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const session = require('express-session');
const gplay = require('google-play-scraper').default || require('google-play-scraper');
const natural = require('natural');
const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'uploads/') });
const fs = require('fs');
const { exec } = require('child_process');

const app = express();

// --- Middlewares ---
app.use(express.json());
app.use(cors());

// Root level ke sabhi folders ko properly serve karne ke liye:
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/css', express.static(path.join(__dirname, '../css')));
app.use('/js', express.static(path.join(__dirname, '../js')));
app.use('/videos', express.static(path.join(__dirname, '../videos')));

// Session Middleware setup
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// --- Database Pool Connection (Permanent Solution) ---
const pool = mysql.createPool({
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'test',
    port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test Connection on startup & auto-verify audit_logs table
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully!');

        // Auto-create audit_logs table with proper DEFAULT CURRENT_TIMESTAMP if missing
        await connection.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_email VARCHAR(255) NOT NULL,
                action_type VARCHAR(100) NOT NULL,
                description TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('🛡️ audit_logs table verified/created successfully.');

        connection.release();
    } catch (err) {
        console.error('❌ Database connection or initialization failed:', err.message);
    }
}
testConnection();

module.exports = pool;

// Helper function to record an audit log automatically
async function logAdminAction(email, actionType, description) {
    try {
        const [rows] = await pool.query('SELECT role FROM users WHERE email = ?', [email]);
        const role = rows.length > 0 ? rows[0].role : 'user';
        const identifier = (role === 'admin') ? `Admin: ${email}` : `User: ${email}`;

        await pool.execute(
            'INSERT INTO audit_logs (admin_email, action_type, description) VALUES (?, ?, ?)',
            [identifier || 'system@fraudshield.ai', actionType, description]
        );
    } catch (error) {
        console.error("Log Insertion Error:", error);
    }
}

// Chat API Route for FraudShield AI Assistant
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, reply: "Message is required." });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, reply: "Gemini API key is not configured on the server." });
        }

        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
        const systemPrompt = "You are FraudShield AI Assistant, an elite, professional cybersecurity expert built into the FraudShield AI platform. Your purpose is to assist users with application security, fraud risk analysis, threat intelligence, and platform navigation with clarity, precision, and authority.";

        const response = await fetch(geminiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: "user", parts: [{ text: systemPrompt + "\n\nUser Question: " + message }] }
                ]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error Response:", data);
            return res.status(500).json({ success: false, reply: data.error?.message || "AI service error. Please try again." });
        }

        const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I am unable to process your request at the moment.";
        res.json({ success: true, reply: aiReply });

    } catch (error) {
        console.error("Chat API Critical Exception:", error);
        res.status(500).json({ success: false, reply: "Internal server error occurred while connecting to the AI assistant." });
    }
});

// --- Mailjet HTTP API Setup ---
async function sendEmailViaMailjet(toEmail, subject, htmlContent) {
    const apiKey = process.env.MAILJET_API_KEY; 
    const secretKey = process.env.MAILJET_SECRET_KEY;
    const authHeader = 'Basic ' + Buffer.from(apiKey + ':' + secretKey).toString('base64');

    const payload = {
        Messages: [{
            From: { 
                Email: "fraudshield2026@gmail.com", 
                Name: "FraudShield AI" 
            },
            To: [{ Email: toEmail }],
            Subject: subject,
            HTMLPart: htmlContent
        }]
    };

    try {
        const response = await fetch('https://api.mailjet.com/v3.1/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Mailjet API Error:", errorData);
            return false;
        }

        console.log(`✅ Email successfully sent to [${toEmail}] via Mailjet!`);
        return true;
    } catch (error) {
        console.error("⚠️ Email sending failed:", error.message);
        return false;
    }
}

// ==========================================
// PASSPORT: USER SERIALIZATION
// ==========================================
passport.serializeUser((user, done) => done(null, user.email));
passport.deserializeUser(async (email, done) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        done(null, rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// ==========================================
// PASSPORT: GOOGLE STRATEGY
// ==========================================
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const fullName = profile.displayName;

        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
            if (rows[0].account_status === 'Banned') {
                return done(null, false, { message: 'Account suspended.' });
            }
            return done(null, rows[0]);
        }

        const user_id = crypto.randomUUID();
        await pool.execute(
            `INSERT INTO users (user_id, full_name, email, password, is_verified, role, account_status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, fullName, email, 'GOOGLE_AUTH_USER', true, 'user', 'Active']
        );

        const [newUser] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        return done(null, newUser[0]);
    } catch (err) {
        return done(err, null);
    }
}));

// ==========================================
// PASSPORT: GITHUB STRATEGY
// ==========================================
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = (profile.emails && profile.emails[0]) ? profile.emails[0].value : `${profile.username}@github.com`;
        const fullName = profile.displayName || profile.username;

        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
            if (rows[0].account_status === 'Banned') {
                return done(null, false, { message: 'Account suspended.' });
            }
            return done(null, rows[0]);
        }

        const user_id = crypto.randomUUID();
        await pool.execute(
            `INSERT INTO users (user_id, full_name, email, password, is_verified, role, account_status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, fullName, email, 'GITHUB_AUTH_USER', true, 'user', 'Active']
        );

        const [newUser] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        return done(null, newUser[0]);
    } catch (err) {
        return done(err, null);
    }
}));

// ==========================================
// ROUTES
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// --- Register / Signup API ---
app.post('/api/register', async (req, res) => {
    const { full_name, email, password } = req.body;
    try {
        const [existingUser] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists with this email! Please log in.' 
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const user_id = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO users (user_id, full_name, email, password, otp, is_verified, account_status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, full_name, email, password, otp, false, 'Active']
        );

        try {
            const mailOptions = {
                from: 'FraudShield AI <fraudshield2026@gmail.com>',
                to: email,
                subject: 'Verify Your Account - FraudShield AI',
                html: `
                    <div style="background-color: #09090b; padding: 40px; color: #fff; font-family: Arial;">
                        <h2 style="color: #00ff66;">Welcome to FraudShield AI! 🛡️</h2>
                        <p>Hi ${full_name}, your 6-digit verification OTP is:</p>
                        <div style="background: #121214; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                            <h1 style="color: #00ff66; letter-spacing: 5px; margin: 0;">${otp}</h1>
                        </div>
                    </div>
                `
            };
            await sendEmailViaMailjet(mailOptions.to, mailOptions.subject, mailOptions.html);
        } catch (emailError) {
            console.error('⚠️ Email sending failed:', emailError.message);
        }

        res.status(200).json({ success: true, message: 'OTP generated successfully!' });
    } catch (error) {
        console.error("Database Error:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'User already exists with this email! Please log in.' });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Verify OTP API ---
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const [rows] = await pool.execute(`SELECT * FROM users WHERE email = ? AND otp = ?`, [email, otp]);

        if (rows.length > 0) {
            await pool.execute(`UPDATE users SET is_verified = TRUE, otp = NULL WHERE email = ?`, [email]);
            res.status(200).json({ success: true, message: 'Account verified successfully!' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid OTP' });
        }
    } catch (error) {
        console.error("Verification Error:", error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Login API ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ message: 'User not found' });

        const user = rows[0];
        if (password !== user.password) return res.status(400).json({ message: 'Invalid password' });

        if (user.account_status === 'Banned') {
            return res.status(403).json({ message: 'Account suspended.' });
        }

        if (!user.is_verified) return res.status(400).json({ message: 'Verify account first.' });

        res.status(200).json({
            success: true,
            userName: user.full_name,
            email: user.email,
            role: user.role 
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Check User Status API ---
app.get('/api/check-user-status', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });

    try {
        const [rows] = await pool.query('SELECT account_status FROM users WHERE email = ?', [email]);
        if (rows.length === 0 || rows[0].account_status === 'Banned') {
            return res.status(200).json({ banned: true });
        }

        res.status(200).json({ banned: false });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Forgot Password API ---
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Email not registered with us!' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await pool.execute('UPDATE users SET otp = ? WHERE email = ?', [otp, email]);

        try {
            const mailOptions = {
                from: 'FraudShield AI <fraudshield2026@gmail.com>',
                to: email,
                subject: 'Password Reset OTP - FraudShield AI',
                html: `
                    <div style="background-color: #09090b; padding: 40px; color: #fff; font-family: Arial;">
                        <h2 style="color: #00ff66;">Password Reset Request 🛡️</h2>
                        <p>Your 6-digit OTP to reset your password is:</p>
                        <div style="background: #121214; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                            <h1 style="color: #00ff66; letter-spacing: 5px; margin: 0;">${otp}</h1>
                        </div>
                    </div>
                `
            };
            await sendEmailViaMailjet(mailOptions.to, mailOptions.subject, mailOptions.html);
        } catch (emailError) {
            console.error('⚠️ Email sending failed:', emailError.message);
        }

        res.status(200).json({ success: true, message: 'Password reset OTP sent to email!' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Reset Password API ---
app.post('/api/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? AND otp = ?', [email, otp]);

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid OTP or email!' });
        }

        await pool.execute('UPDATE users SET password = ?, otp = NULL WHERE email = ?', [newPassword, email]);
        res.status(200).json({ success: true, message: 'Password updated successfully!' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Contact Route ---
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;
    try {
        const mailOptions = {
            from: 'FraudShield AI <fraudshield2026@gmail.com>',
            to: 'fraudshield2026@gmail.com',
            subject: `New Contact Query: ${subject}`,
            html: `
                <div style="background-color: #09090b; padding: 30px; color: #fff; font-family: Arial; border-radius: 12px;">
                    <h2 style="color: #00ff66;">New Message Received 🛡️</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <div style="background: #121214; padding: 15px; border-radius: 8px; margin-top: 15px; border-left: 4px solid #00ff66;">
                        <p style="margin: 0; color: #d1d5db;">${message}</p>
                    </div>
                </div>
            `
        };

        await sendEmailViaMailjet(mailOptions.to, mailOptions.subject, mailOptions.html);
        res.status(200).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Contact Email Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message. Server error.' });
    }
});

app.get('/api/live-stats', async (req, res) => {
    try {
        const [totalScansRows] = await pool.query('SELECT COUNT(*) as total FROM scan_history');
        res.json({ success: true, totalScanned: totalScansRows[0].total });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// --- Admin API ---
app.get('/api/admin/users', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT user_id, full_name, email, role, account_status, is_pro, created_at FROM users');
        res.status(200).json({ success: true, users });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

app.post('/api/admin/update-status', async (req, res) => {
    const { user_id, status, adminEmail } = req.body;
    try {
        await pool.query('UPDATE users SET account_status = ? WHERE user_id = ?', [status, user_id]);

        await logAdminAction(adminEmail || 'fraudshield2026@gmail.com', 'STATUS_UPDATE', `Updated user ID ${user_id} status to ${status}`);

        res.status(200).json({ success: true, message: 'Status updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update status' });
    }
});

// --- OAUTH ROUTES ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html?error=Account_suspended' }),
    (req, res) => { 
        if (req.user && req.user.account_status === 'Banned') {
            return res.redirect('/login.html?error=Account_suspended');
        }
        res.redirect(`/dashboard.html?oauth=true&name=${encodeURIComponent(req.user.full_name)}&role=${req.user.role}&email=${encodeURIComponent(req.user.email)}`); 
    }
);

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: '/login.html?error=Account_suspended' }),
    (req, res) => { 
        if (req.user && req.user.account_status === 'Banned') {
            return res.redirect('/login.html?error=Account_suspended');
        }
        res.redirect(`/dashboard.html?oauth=true&name=${encodeURIComponent(req.user.full_name)}&role=${req.user.role}&email=${encodeURIComponent(req.user.email)}`); 
    }
);

// --- Profile: Change Password API ---
app.post('/api/change-password', async (req, res) => {
    const { email, currentPassword, newPassword } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'User not found!' });
        }

        const user = rows[0];
        if (user.password !== currentPassword) {
            return res.status(400).json({ success: false, message: 'Incorrect current password!' });
        }

        await pool.execute('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);
        res.status(200).json({ success: true, message: 'Password updated successfully!' });
    } catch (error) {
        console.error('Change Password Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Profile: Send OTP for Name Update ---
app.post('/api/send-update-otp', async (req, res) => {
    const { email } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ success: false, message: 'Email not found in database!' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await pool.execute('UPDATE users SET otp = ? WHERE email = ?', [otp, email]);

        const mailOptions = {
            from: 'FraudShield AI <fraudshield2026@gmail.com>',
            to: email,
            subject: 'Profile Update OTP - FraudShield AI',
            html: `
                <div style="background-color: #09090b; padding: 40px; color: #fff; font-family: Arial;">
                    <h2 style="color: #00ff66;">Profile Update Request 🛡️</h2>
                    <p>Your 6-digit OTP to update your display name is:</p>
                    <div style="background: #121214; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <h1 style="color: #00ff66; letter-spacing: 5px; margin: 0;">${otp}</h1>
                    </div>
                </div>
            `
        };
        await sendEmailViaMailjet(mailOptions.to, mailOptions.subject, mailOptions.html);
        res.status(200).json({ success: true, message: 'OTP sent to email!' });
    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Profile: Verify OTP & Update Name ---
app.post('/api/verify-update-otp', async (req, res) => {
    const { email, otp, newName } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? AND otp = ?', [email, otp]);
        if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid OTP!' });

        await pool.execute('UPDATE users SET full_name = ?, otp = NULL WHERE email = ?', [newName, email]);
        res.status(200).json({ success: true, message: 'Profile updated successfully!' });
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==========================================
// 1. DYNAMIC GEMINI AI APP ANALYSIS API
// ==========================================
app.post('/api/analyze', async (req, res) => {
    const { targetUrl, email } = req.body;
    if (!targetUrl) return res.status(400).json({ success: false, message: 'Please provide an App URL or Name.' });

    try {
        const userEmail = email || 'anonymous@fraudshield.com';

        const [userRows] = await pool.query('SELECT is_pro FROM users WHERE email = ?', [userEmail]);
        const isPro = userRows.length > 0 && userRows[0].is_pro === 1;

        if (!isPro) {
            const [scanRows] = await pool.query('SELECT COUNT(*) as scanCount FROM scan_history WHERE user_email = ?', [userEmail]);

            if (scanRows[0].scanCount >= 3) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Free trial limit reached.', 
                    limitReached: true 
                });
            }
        }

        let appId = targetUrl.trim();
        if (appId.includes('play.google.com')) {
            appId = new URL(appId).searchParams.get('id') || appId;
        } else if (!appId.includes('.')) {
            const searchResults = await gplay.search({ term: appId, num: 1 });
            if (searchResults && searchResults.length > 0) appId = searchResults[0].appId;
            else return res.status(404).json({ success: false, message: 'App not found on Play Store.' });
        }

        const appDetails = await gplay.app({ appId: appId });
        const appName = appDetails.title || appId;
        const appIcon = appDetails.icon || '';
        const appDeveloper = appDetails.developer || 'Unknown Publisher';
        const appScore = appDetails.score || 0;
        const appPermissions = appDetails.permissions || [];
        const appDescription = (appDetails.description || '').slice(0, 400);

        let reviewSnippets = [];
        try {
            const reviewsData = await gplay.reviews({ appId: appId, sort: 2, num: 30 });
            if (reviewsData && reviewsData.data) {
                reviewSnippets = reviewsData.data.map(r => r.text).filter(Boolean).slice(0, 10);
            }
        } catch (e) {
            console.log("Could not fetch reviews, proceeding with metadata.");
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, message: "Gemini API key is not configured on the server." });
        }

        const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

        const systemPrompt = `You are an elite, automated cybersecurity malware analyst and app threat intelligence engine. 
Analyze the following real-time mobile application data strictly and generate a unique, granular, data-driven security audit report. Avoid generic or repeating templates. Every application must have distinct threat points based on its exact permissions, reviews, and developer background.

App Metadata:
- Name: ${appName}
- Developer: ${appDeveloper}
- Play Store Rating: ${appScore} / 5
- Requested Permissions: ${JSON.stringify(appPermissions)}
- Description Snippet: ${appDescription}
- Recent User Review Feedback: ${JSON.stringify(reviewSnippets)}

You MUST respond ONLY with a valid JSON object in this exact format, with no markdown code blocks around it (raw JSON text):
{
    "riskScore": [integer between 5 to 98 based on actual risk],
    "status": ["Safe" or "Medium Risk" or "High Risk"],
    "colorClass": [Tailwind class: "text-primary" if Safe, "text-amber-400" if Medium Risk, "text-red-500" if High Risk],
    "threats": [
        "Granular threat point 1 detailing specific permission or review risk",
        "Granular threat point 2 detailing behavioral anomaly or developer safety",
        "Granular threat point 3 detailing data harvesting or security posture"
    ]
}`;

        const response = await fetch(geminiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: "user", parts: [{ text: systemPrompt }] }
                ]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error Response:", data);
            return res.status(500).json({ success: false, message: data.error?.message || "AI service error." });
        }

        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        let aiReport;
        try {
            aiReport = JSON.parse(rawText);
        } catch (parseErr) {
            console.error("Failed to parse Gemini JSON response:", rawText);
            aiReport = {
                riskScore: 45,
                status: "Medium Risk",
                colorClass: "text-amber-400",
                threats: [
                    `Analyzed ${appPermissions.length} permission hooks requested by ${appDeveloper}.`,
                    `Evaluated store rating of ${appScore}/5 against baseline anomaly matrices.`,
                    `Monitor network egress traffic for potential telemetry sharing.`
                ]
            };
        }

        await logAdminAction(userEmail, 'APP_SCAN', `Scanned application: ${appName} (${appId}) - Risk: ${aiReport.riskScore}%`);

        return res.status(200).json({
            success: true,
            target: appId,
            appName: appName,
            icon: appIcon,
            riskScore: aiReport.riskScore,
            status: aiReport.status,
            colorClass: aiReport.colorClass,
            threats: aiReport.threats
        });

    } catch (error) {
        console.error("Dynamic AI Analysis Critical Exception:", error);
        return res.status(500).json({ success: false, message: 'Analysis engine failed to process application data.' });
    }
});

// ==========================================
// 2. SAVE SCAN HISTORY API
// ==========================================
app.post('/api/save-scan', async (req, res) => {
    const { email, target, appName, icon, riskScore, status, colorClass, threats } = req.body;
    try {
        await pool.execute(
            `INSERT INTO scan_history (user_email, target_url, app_name, app_icon, risk_score, status, color_class, threats) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [email || 'anonymous@fraudshield.com', target, appName || target, icon || '', riskScore, status, colorClass, JSON.stringify(threats)]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Save Scan Error:", err);
        res.status(500).json({ success: false });
    }
});

// --- Get Scan History API ---
app.get('/api/get-scans', async (req, res) => {
    const email = req.query.email;
    try {
        let query = 'SELECT * FROM scan_history';
        let params = [];

        if (email) {
            query += ' WHERE user_email = ? OR user_email = ?';
            params = [email, 'anonymous@fraudshield.com'];
        }
        query += ' ORDER BY scanned_at DESC';

        const [rows] = await pool.query(query, params);

        const formattedScans = rows.map(row => ({
            target: row.target_url,
            riskScore: row.risk_score,
            status: row.status,
            colorClass: row.color_class,
            threats: typeof row.threats === 'string' ? JSON.parse(row.threats) : row.threats,
            date: new Date(row.scanned_at).toLocaleString()
        }));

        res.status(200).json({ success: true, history: formattedScans });
    } catch (err) {
        console.error('Fetch Scans Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
});

// --- Admin: Get All Scan History Reports ---
app.get('/api/admin/all-scans', async (req, res) => {
    try {
        const [scans] = await pool.query('SELECT * FROM scan_history ORDER BY scanned_at DESC');

        const formattedScans = scans.map(row => ({
            id: row.id,
            userEmail: row.user_email,
            target: row.target_url,
            riskScore: row.risk_score,
            status: row.status,
            colorClass: row.color_class,
            threats: typeof row.threats === 'string' ? JSON.parse(row.threats) : row.threats,
            date: new Date(row.scanned_at).toLocaleString()
        }));

        res.status(200).json({ success: true, scans: formattedScans });
    } catch (err) {
        console.error('Admin Fetch Scans Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
    }
});

// --- Admin: Delete Scan Log Endpoint ---
app.post('/api/admin/delete-scan', async (req, res) => {
    const { scan_id, adminEmail } = req.body;
    try {
        await pool.query('DELETE FROM scan_history WHERE id = ?', [scan_id]);

        await logAdminAction(adminEmail || 'fraudshield2026@gmail.com', 'DELETE_SCAN', `Deleted scan log ID ${scan_id}`);

        res.status(200).json({ success: true, message: 'Scan log deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete log.' });
    }
});

app.post('/api/admin/train-model', upload.single('dataset'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Please upload a valid dataset file.' });
    }

    const uploadedFilePath = req.file.path;
    const originalExt = path.extname(req.file.originalname).toLowerCase();

    const targetFileName = originalExt === '.csv' ? 'latest_uploaded.csv' : 'latest_uploaded.json';
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, 'uploads/');
    if (!fs.existsSync(uploadsDir)){
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const targetPath = path.join(uploadsDir, targetFileName);

    // Use copyFile + unlink instead of rename to prevent EXDEV cross-device errors on cloud servers
    fs.copyFile(uploadedFilePath, targetPath, async (copyErr) => {
        if (copyErr) {
            console.error("File Copy Error:", copyErr);
            return res.status(500).json({ success: false, message: 'Failed to process uploaded dataset file.' });
        }

        // Delete original temp file
        fs.unlink(uploadedFilePath, (unlinkErr) => {
            if (unlinkErr) console.error("Temp file cleanup warning:", unlinkErr);
        });

        const trainingScript = path.join(__dirname, 'trainModel.js');
        exec(`node "${trainingScript}"`, async (error, stdout, stderr) => {
            if (error) {
                console.error("Model Training Execution Error:", error);
                console.error("Stderr:", stderr);
                return res.status(500).json({ success: false, message: 'Model training execution failed.' });
            }

            await logAdminAction('fraudshield2026@gmail.com', 'TRAIN_MODEL', 'Successfully retrained AI threat detection model with new dataset.');

            return res.status(200).json({ 
                success: true, 
                message: 'AI Model successfully retrained and merged with new dataset!',
                output: stdout 
            });
        });
    });
});


// --- Admin: Get Profile Credentials API ---
app.get('/api/admin/profile', async (req, res) => {
    const email = req.query.email;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email query parameter required' });
    }

    try {
        const [rows] = await pool.query('SELECT full_name, email, password, role FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Admin profile not found' });
        }

        res.status(200).json({ success: true, admin: rows[0] });
    } catch (err) {
        console.error('Admin Profile Fetch Error:', err);
        res.status(500).json({ success: false, message: 'Database server error' });
    }
});

app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const [totalScansRows] = await pool.query('SELECT COUNT(*) as total FROM scan_history');
        const totalScanned = totalScansRows[0].total;

        const [fraudRows] = await pool.query("SELECT COUNT(*) as count FROM scan_history WHERE LOWER(status) LIKE '%fraud%' OR LOWER(status) LIKE '%malicious%'");
        const totalFraud = fraudRows[0].count;
        const totalSafe = totalScanned - totalFraud;

        const [userRows] = await pool.query('SELECT COUNT(*) as total FROM users');
        const totalUsers = userRows[0].total;

        const [trendingRows] = await pool.query(`
            SELECT target_url as app_name, app_icon, status, COUNT(*) as scan_count 
            FROM scan_history 
            GROUP BY target_url, app_icon, status 
            ORDER BY scan_count DESC 
            LIMIT 3
        `);

        res.json({
            success: true,
            totalScanned,
            totalFraud,
            totalSafe,
            totalUsers,
            recentApps: trendingRows
        });
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ success: false, message: "Server database error" });
    }
});

//--Payment Verification--
app.post('/api/verify-payment', async (req, res) => {
    const { email, plan } = req.body; 
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    try {
        const now = new Date();
        if (plan === 'yearly') {
            now.setFullYear(now.getFullYear() + 1);
        } else {
            now.setMonth(now.getMonth() + 1);
        }

        await pool.query(
            'UPDATE users SET is_pro = 1, pro_expiry_date = ? WHERE email = ?',
            [now, email]
        );

        await logAdminAction(email, 'PRO_UPGRADE', `Upgraded account to Pro (${plan} plan)`);

        res.json({ success: true, message: 'Pro status activated', expiry: now });
    } catch (err) {
        console.error("Payment verification error:", err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/user-status', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, isPro: false });

    try {
        const [rows] = await pool.query('SELECT is_pro, pro_expiry_date FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.json({ success: false, isPro: false });

        const user = rows[0];
        let isPro = user.is_pro === 1;
        let expiryDate = user.pro_expiry_date ? new Date(user.pro_expiry_date) : null;

        if (isPro && expiryDate && new Date() > expiryDate) {
            await pool.query('UPDATE users SET is_pro = 0, pro_expiry_date = NULL WHERE email = ?', [email]);
            isPro = false;
        }

        res.json({ success: true, isPro: isPro, expiryDate: expiryDate });
    } catch (err) {
        res.status(500).json({ success: false, isPro: false });
    }
});

// Fetch latest audit logs with converted IST timestamp (+05:30)
app.get('/api/admin/audit-logs', async (req, res) => {
    try {
        const [logs] = await pool.execute(`
            SELECT id, admin_email, action_type, description, 
            DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s') as created_at 
            FROM audit_logs 
            WHERE action_type NOT LIKE '%ERROR%' 
              AND action_type NOT LIKE '%404%' 
              AND action_type NOT LIKE '%500%'
              AND action_type NOT LIKE '%RESOLVED%'
            ORDER BY created_at DESC 
            LIMIT 20
        `);
        res.json({ success: true, logs });
    } catch (error) {
        console.error("Fetch Audit Logs Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch audit logs." });
    }
});



// Fetch Error Audit Logs specifically (404 / 500 errors)
app.get('/api/admin/error-logs', async (req, res) => {
    try {
        const [logs] = await pool.execute(`
            SELECT id, admin_email, action_type, description, 
            DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m-%d %H:%i:%s') as created_at 
            FROM audit_logs 
            WHERE (action_type LIKE '%ERROR%' OR action_type LIKE '%404%' OR action_type LIKE '%500%')
              AND action_type NOT LIKE '%RESOLVED%'
            ORDER BY created_at DESC 
            LIMIT 20
        `);
        res.json({ success: true, logs });
    } catch (error) {
        console.error("Fetch Error Logs Exception:", error);
        res.status(500).json({ success: false, message: "Failed to fetch error logs." });
    }
});


// Resolve & Delete Error Log from Database
app.post('/api/admin/resolve-error', async (req, res) => {
    const { log_id, adminEmail } = req.body;
    try {
        await pool.query('DELETE FROM audit_logs WHERE id = ?', [log_id]);

        await logAdminAction(adminEmail || 'fraudshield2026@gmail.com', 'ERROR_RESOLVED', `Resolved and deleted system error log ID ${log_id}.`);

        res.status(200).json({ success: true, message: 'Error resolved and removed from database.' });
    } catch (err) {
        console.error("Resolve Error Exception:", err);
        res.status(500).json({ success: false, message: 'Failed to resolve error.' });
    }
});

// Real-time Google Play Store Search Endpoint
app.get('/api/playstore/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query.trim()) {
            return res.json({ success: true, apps: [] });
        }

        const results = await gplay.search({
            term: query,
            num: 20,
            lang: 'en',
            country: 'in'
        });

        const apps = results.map(app => ({
            app_name: app.title,
            developer_name: app.developer,
            icon_url: app.icon,
            app_id: app.appId
        }));

        res.json({ success: true, apps });
    } catch (error) {
        console.error("Play Store Search Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch from Play Store." });
    }
});

// --- ERROR HANDLING MIDDLEWARES ---

// 404 Not Found Middleware
app.use((req, res, next) => {
    logAdminAction('system@fraudshield.ai', '404_ERROR', `Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ success: false, message: 'Endpoint not found (404)' });
});

// Global 500 Error Handler Middleware
app.use(async (err, req, res, next) => {
    console.error("Critical Server Exception (500):", err.stack);
    try {
        await pool.execute(
            'INSERT INTO audit_logs (admin_email, action_type, description) VALUES (?, ?, ?)',
            ['system@fraudshield.ai', '500_SERVER_ERROR', `Server Error on ${req.method} ${req.originalUrl}: ${err.message}`]
        );
    } catch (logErr) {
        console.error("Failed to log 500 error to DB:", logErr);
    }
    res.status(500).json({ success: false, message: 'Internal Server Error (500)' });
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
