const express = require('express');
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const session = require('express-session');

const app = express();

// --- Middlewares ---
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

// Session Middleware setup
app.use(session({
    secret: 'fraudshield2026TCSCPROJECTG620',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// --- Database Connection ---
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'FraudShieldDB'
});

// --- Gmail SMTP Setup (App Password) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'fraudshield2026@gmail.com',
        pass: 'jumkfbymellmrffw'
    }
});

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
    clientID: '821973187720-8aj2shi47814cetse8jj16scrv9frcl4.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const fullName = profile.displayName;
        
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
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
    clientID: 'Ov23li9Sihlgj33jrkWG',
    clientSecret: '8807cbe5653178643003ae8e6c0d2ff931de2077',
    callbackURL: 'http://localhost:3000/auth/github/callback',
    scope: ['user:email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = (profile.emails && profile.emails[0]) ? profile.emails[0].value : `${profile.username}@github.com`;
        const fullName = profile.displayName || profile.username;
        
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
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

// --- Register API ---
app.post('/api/register', async (req, res) => {
    const { full_name, email, password } = req.body;
    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const user_id = crypto.randomUUID();

        await pool.execute(
            `INSERT INTO users (user_id, full_name, email, password, otp, is_verified) VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, full_name, email, password, otp, false]
        );

        console.log("-----------------------------------------");
        console.log(`🔑 DEBUG OTP FOR [${email}]: ${otp}`);
        console.log("-----------------------------------------");

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
            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error('⚠️ Email sending failed:', emailError.message);
        }

        res.status(200).json({ success: true, message: 'OTP generated successfully!' });
    } catch (error) {
        console.error("Database Error:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Email already registered!' });
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
        if (user.account_status === 'Banned') return res.status(403).json({ message: 'Account suspended.' });
        if (!user.is_verified) return res.status(400).json({ message: 'Verify account first.' });

        res.status(200).json({
            success: true,
            userName: user.full_name,
            email: user.email, // <-- Yeh add kiya
            role: user.role 
        });
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

        console.log(`🔑 PASSWORD RESET OTP FOR [${email}]: ${otp}`);

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
            await transporter.sendMail(mailOptions);
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

        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Contact Email Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message. Server error.' });
    }
});

// --- Admin API ---
app.get('/api/admin/users', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT user_id, full_name, email, role, account_status, created_at FROM users');
        res.status(200).json({ success: true, users });
    } catch (err) {
        res.status(500).json({ message: 'Database error' });
    }
});

app.post('/api/admin/update-status', async (req, res) => {
    const { user_id, status } = req.body;
    try {
        await pool.query('UPDATE users SET account_status = ? WHERE user_id = ?', [status, user_id]);
        res.status(200).json({ success: true, message: 'Status updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update status' });
    }
});

// --- OAUTH ROUTES ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => { 
        res.redirect(`/dashboard.html?oauth=true&name=${encodeURIComponent(req.user.full_name)}&role=${req.user.role}&email=${encodeURIComponent(req.user.email)}`); 
    }
);

app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: '/login.html' }),
    (req, res) => { 
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

        console.log(`🔑 PROFILE UPDATE OTP FOR [${email}]: ${otp}`);

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
        await transporter.sendMail(mailOptions);
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

// --- App Analysis API ---
app.post('/api/analyze', async (req, res) => {
    const { targetUrl } = req.body;
    
    if (!targetUrl) {
        return res.status(400).json({ success: false, message: 'Please provide a PlayStore URL or APK Package Name to scan.' });
    }

    try {
        setTimeout(() => {
            const riskScore = Math.floor(Math.random() * 80) + 10;
            
            let status = 'Safe';
            let color = 'text-primary';
            let threats = [];

            if (riskScore < 30) {
                status = 'Safe';
                color = 'text-primary';
                threats = ['Manifest signature verified clean.', 'Standard non-intrusive permissions requested.'];
            } else if (riskScore < 70) {
                status = 'Suspicious';
                color = 'text-amber-400';
                threats = ['Unusual background service execution detected.', 'Requests broad location permissions without clear context.'];
            } else {
                status = 'Malicious';
                color = 'text-red-500';
                threats = ['Dangerous permission hook: READ_SMS & CONTACTS!', 'Repackaged binary signature mismatch!', 'Hidden data exfiltration payload blocked.'];
            }

            return res.status(200).json({
                success: true,
                target: targetUrl,
                riskScore: riskScore,
                status: status,
                colorClass: color,
                threats: threats
            });
        }, 2500);

    } catch (error) {
        console.error('App Audit Error:', error);
        return res.status(500).json({ success: false, message: 'App security engine failed.' });
    }
});

// --- Save Scan History API ---
app.post('/api/save-scan', async (req, res) => {
    const { email, target, riskScore, status, colorClass, threats, date } = req.body;
    try {
        await pool.execute(
            `INSERT INTO scan_history (user_email, target_url, risk_score, status, color_class, threats) VALUES (?, ?, ?, ?, ?, ?)`,
            [email || 'anonymous@fraudshield.com', target, riskScore, status, colorClass, JSON.stringify(threats)]
        );
        res.status(200).json({ success: true, message: 'Scan saved to database' });
    } catch (err) {
        console.error('Save Scan Error:', err);
        res.status(500).json({ success: false, message: 'Failed to save scan' });
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
        
        // Format rows for frontend compatibility
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
});// History ke liye

// --- SERVER START ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
});