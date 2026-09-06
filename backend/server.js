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
            email: user.email,
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
        const [users] = await pool.query('SELECT user_id, full_name, email, role, account_status,is_pro, created_at FROM users');
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

// ==========================================
// 1. ASLI AI APP ANALYSIS API (Updated with Logo)
// ==========================================
app.post('/api/analyze', async (req, res) => {
    const { targetUrl, email } = req.body;
    if (!targetUrl) return res.status(400).json({ success: false, message: 'Please provide an App URL or Name.' });

    try {
        const userEmail = email || 'anonymous@fraudshield.com';
        
        // 1. Check if user is Pro
        const [userRows] = await pool.query('SELECT is_pro FROM users WHERE email = ?', [userEmail]);
        const isPro = userRows.length > 0 && userRows[0].is_pro === 1;

        // 2. If not Pro, check trial limit
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
            else return res.status(404).json({ success: false, message: 'App not found.' });
        }

        const appDetails = await gplay.app({ appId: appId });
        const appName = appDetails.title || appId;
        const appIcon = appDetails.icon || '';

        const reviewsData = await gplay.reviews({ appId: appId, sort: 2, num: 100 });
        if (!reviewsData.data || reviewsData.data.length === 0) return res.status(400).json({ success: false, message: 'Not enough reviews.' });

        const modelPath = path.join(__dirname, 'fraud_model.json');
        natural.BayesClassifier.load(modelPath, null, function(err, classifier) {
            if (err) return res.status(500).json({ success: false, message: 'Model missing.' });

            const tokenizer = new natural.WordTokenizer();
            let fraudCount = 0, totalRating = 0;
            let specificThreats = new Set();

            reviewsData.data.forEach(rev => {
                totalRating += rev.score;
                let cleaned = (rev.text || "").toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
                let sentiment = classifier.classify(tokenizer.tokenize(cleaned));

                if (sentiment === 'Fraud' || rev.score <= 2) {
                    fraudCount++;
                    if (cleaned.includes('otp')) specificThreats.add("CRITICAL VULNERABILITY: OTP risks detected.");
                    if (cleaned.includes('money')) specificThreats.add("FINANCIAL FRAUD: Unauthorized deductions reported.");
                    if (cleaned.includes('fake') || cleaned.includes('scam')) specificThreats.add("SIGNATURE ANOMALY: Flagged as scam.");
                }
            });

            let avgRating = totalRating / reviewsData.data.length;
            let fraudRatio = fraudCount / reviewsData.data.length;
            let riskScore = Math.max(5, Math.min(Math.round(((5 - avgRating) * 12) + (fraudRatio * 70)), 98));

            let status = riskScore >= 70 ? 'High Risk' : (riskScore >= 35 ? 'Medium Risk' : 'Low Risk');
            let color = riskScore >= 70 ? 'text-red-500' : (riskScore >= 35 ? 'text-amber-400' : 'text-primary');
            
            let finalThreats = [
                riskScore >= 70 ? `CRITICAL: ${Math.round(fraudRatio * 100)}% reviews are Fraudulent.` : 
                (riskScore >= 35 ? `WARNING: ${Math.round(fraudRatio * 100)}% reviews show negative sentiment.` : "Majority sentiment is Safe."),
                `Average rating is (${avgRating.toFixed(1)}/5).`,
                ...Array.from(specificThreats)
            ];

            return res.status(200).json({
                success: true,
                target: appName,
                icon: appIcon,
                riskScore, 
                status, 
                colorClass: color, 
                threats: finalThreats
            });
        });

    } catch (error) {
        console.error("Analysis Error:", error);
        return res.status(500).json({ success: false, message: 'Analysis failed.' });
    }
});

// ==========================================
// 2. SAVE SCAN HISTORY API (Updated with Logo)
// ==========================================
app.post('/api/save-scan', async (req, res) => {
    // 🆕 Frontend se icon receive kiya
    const { email, target, icon, riskScore, status, colorClass, threats } = req.body;
    try {
        await pool.execute(
            // 🆕 Database mein app_icon add kar diya
            `INSERT INTO scan_history (user_email, target_url, app_icon, risk_score, status, color_class, threats) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [email || 'anonymous@fraudshield.com', target, icon || '', riskScore, status, colorClass, JSON.stringify(threats)]
        );
        res.status(200).json({ success: true });
    } catch (err) {
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
    const { scan_id } = req.body;
    try {
        await pool.query('DELETE FROM scan_history WHERE id = ?', [scan_id]);
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
    
    // Check file extension (.json or .csv)
    const targetFileName = originalExt === '.csv' ? 'latest_uploaded.csv' : 'latest_uploaded.json';
    const targetPath = path.join(__dirname, 'uploads/', targetFileName);

    fs.rename(uploadedFilePath, targetPath, (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to process uploaded dataset file.' });
        }

        exec('node trainModel.js', (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ success: false, message: 'Model training execution failed.' });
            }
            return res.status(200).json({ 
                success: true, 
                message: 'AI Model successfully retrained and merged with new dataset!',
                output: stdout 
            });
        });
    });
});

app.get('/api/dashboard-stats', async (req, res) => {
    try {
        // 1. Total Scanned Apps
        const [totalScansRows] = await pool.query('SELECT COUNT(*) as total FROM scan_history');
        const totalScanned = totalScansRows[0].total;

        // 2. Fraud vs Safe
        const [fraudRows] = await pool.query("SELECT COUNT(*) as count FROM scan_history WHERE LOWER(status) LIKE '%fraud%' OR LOWER(status) LIKE '%malicious%'");
        const totalFraud = fraudRows[0].count;
        const totalSafe = totalScanned - totalFraud;

        // 3. Total Users
        const [userRows] = await pool.query('SELECT COUNT(*) as total FROM users');
        const totalUsers = userRows[0].total;

        // 4. 🔥 YAHAN CHANGE KIYA HAI: 'app_icon' database se manga liya
        const [recentRows] = await pool.query('SELECT target_url as app_name, app_icon, status, user_email as scanned_by FROM scan_history ORDER BY id DESC LIMIT 3');

        res.json({
            success: true,
            totalScanned,
            totalFraud,
            totalSafe,
            totalUsers,
            recentApps: recentRows
        });
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ success: false, message: "Server database error" });
    }
});
//--Payment Verification--
app.post('/api/verify-payment', async (req, res) => {
    const { email, plan } = req.body; // plan = 'monthly' ya 'yearly'
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    try {
        // Expiry calculation
        const now = new Date();
        if (plan === 'yearly') {
            now.setFullYear(now.getFullYear() + 1); // 1 Year validity
        } else {
            now.setMonth(now.getMonth() + 1); // 1 Month validity
        }

        // Database mein is_pro = 1 aur expiry date update karein
        await pool.query(
            'UPDATE users SET is_pro = 1, pro_expiry_date = ? WHERE email = ?',
            [now, email]
        );

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

        // Agar time khatam ho gaya hai, toh automatic free tier par shift kar do
        if (isPro && expiryDate && new Date() > expiryDate) {
            await pool.query('UPDATE users SET is_pro = 0, pro_expiry_date = NULL WHERE email = ?', [email]);
            isPro = false;
        }

        res.json({ success: true, isPro: isPro, expiryDate: expiryDate });
    } catch (err) {
        res.status(500).json({ success: false, isPro: false });
    }
});

// --- SERVER START ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
});