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

// --- Asli AI App Analysis API ---
app.post('/api/analyze', async (req, res) => {
    const { targetUrl } = req.body;
    
    if (!targetUrl) {
        return res.status(400).json({ success: false, message: 'Please provide a PlayStore URL, App Name, or Package Name.' });
    }

    try {
        let appId = targetUrl.trim();

        // STEP 1: URL hai ya Name, uske hisaab se App ID nikalna
        if (appId.includes('play.google.com')) {
            const urlObj = new URL(appId);
            appId = urlObj.searchParams.get('id') || appId;
        } else if (!appId.includes('.')) {
            // Agar user ne sirf naam diya hai (jaise "spotify" ya "zomato")
            try {
                console.log(`🔍 Searching Play Store dynamically for: ${appId}`);
                const searchResults = await gplay.search({ term: appId, num: 1 });
                
                if (searchResults && searchResults.length > 0) {
                    appId = searchResults[0].appId;
                    console.log(`✅ Auto-resolved to Package ID: ${appId}`);
                } else {
                    return res.status(404).json({ success: false, message: `App "${appId}" not found on Play Store.` });
                }
            } catch (searchErr) {
                console.error('Search API Error:', searchErr);
                return res.status(500).json({ success: false, message: 'Failed to resolve app name from Play Store.' });
            }
        }

        console.log(`📡 Fetching latest reviews for: ${appId}`);

        const reviewsData = await gplay.reviews({
            appId: appId,
            sort: 2, 
            num: 100
        });

        if (!reviewsData.data || reviewsData.data.length === 0) {
            return res.status(400).json({ success: false, message: 'Not enough reviews found to analyze this app.' });
        }

        const reviews = reviewsData.data;

        const modelPath = path.join(__dirname, 'fraud_model.json');
        if (!fs.existsSync(modelPath)) {
            return res.status(500).json({ success: false, message: 'AI Model missing. Run trainModel.js first.' });
        }

        natural.BayesClassifier.load(modelPath, null, function(err, classifier) {
    if (err) {
        return res.status(500).json({ success: false, message: 'Failed to load Sentiment Engine.' });
    }

    const tokenizer = new natural.WordTokenizer();
    let fraudCount = 0;
    let totalRating = 0;
    let specificThreats = new Set();

    reviews.forEach(rev => {
        totalRating += rev.score;
        let text = rev.text ? rev.text : "";
        
        let cleaned = text.toLowerCase()
                          .replace(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/g, ' __LINK__ ')
                          .replace(/(\+?\d{1,3}[-.\s]?)?(\d{10})/g, ' __PHONE__ ')
                          .replace(/[^a-z0-9_\s]/gi, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();

        let tokens = tokenizer.tokenize(cleaned);
        let sentiment = classifier.classify(tokens); 

        if (sentiment === 'Fraud' || rev.score <= 2) {
            fraudCount++;
            if (cleaned.includes('otp')) specificThreats.add("CRITICAL VULNERABILITY: Multiple user reports highlighting intercepted or delayed OTPs, risking authentication hijacking.");
            if (cleaned.includes('money') || cleaned.includes('deduct') || cleaned.includes('paisa')) specificThreats.add("FINANCIAL FRAUD INDICATOR: Verified user complaints regarding unauthorized background balance deductions or wallet scams.");
            if (cleaned.includes('fake') || cleaned.includes('scam') || cleaned.includes('chor')) specificThreats.add("SIGNATURE ANOMALY: High concentration of community flags identifying this application as a fraudulent clone or scam software.");
            if (cleaned.includes('__link__')) specificThreats.add("MALICIOUS INJECTION: Suspicious external phishing links or rogue landing URLs detected within user-generated reviews.");
            if (cleaned.includes('__phone__')) specificThreats.add("SOCIAL ENGINEERING: Potential impersonation threat—scammers posting unauthorized customer service phone numbers in feedback sections.");
        }
    });

    let avgRating = totalRating / reviews.length;
    let fraudRatio = fraudCount / reviews.length; 
    
    let riskScore = Math.round(((5 - avgRating) * 12) + (fraudRatio * 70));
    riskScore = Math.max(5, Math.min(riskScore, 98)); 

    let status = 'Low Risk';
    let color = 'text-primary';
    let finalThreats = [];

    if (riskScore >= 70) {
        status = 'High Risk';
        color = 'text-red-500';
        finalThreats.push(`CRITICAL: AI Sentiment Engine flagged ${Math.round(fraudRatio * 100)}% of recent reviews as Fraudulent.`);
    } else if (riskScore >= 35) {
        status = 'Medium Risk';
        color = 'text-amber-400';
        finalThreats.push(`WARNING: AI noticed ${Math.round(fraudRatio * 100)}% reviews with negative/fraud sentiment.`);
    } else {
        status = 'Low Risk';
        color = 'text-primary';
        finalThreats.push("Majority of user sentiment is Positive and Safe.");
    }

    finalThreats.push(`Average user rating is (${avgRating.toFixed(1)}/5).`);
    finalThreats = finalThreats.concat(Array.from(specificThreats));

    if (finalThreats.length <= 2) {
        finalThreats.push("No major behavioral anomalies detected in recent logs.");
    }

    const insertQuery = `INSERT INTO scan_history (user_email, target_url, risk_score, status, color_class, threats) VALUES (?, ?, ?, ?, ?, ?)`;
    const userEmail = req.body.email || 'anonymous@fraudshield.com';

    pool.execute(insertQuery, [userEmail, appId, riskScore, status, color, JSON.stringify(finalThreats)])
        .catch(dbErr => console.error('Database Save Error:', dbErr));

    return res.status(200).json({
        success: true,
        target: appId,
        riskScore: riskScore,
        status: status,
        colorClass: color,
        threats: finalThreats
    });
});

    } catch (error) {
        console.error('Live App Analysis Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch Play Store data or run AI analysis.' });
    }
});

// --- Save Scan History API ---
app.post('/api/save-scan', async (req, res) => {
    const { email, target, riskScore, status, colorClass, threats } = req.body;
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
        // 1. Total Scanned Apps Count from scan_history
        const [totalScansRows] = await pool.query('SELECT COUNT(*) as total FROM scan_history');
        const totalScanned = totalScansRows[0].total;

        // 2. Fraud vs Safe Count (Aapke schema ke mutabiq status 'Fraud' ya 'Safe' hota hai)
        const [fraudRows] = await pool.query("SELECT COUNT(*) as count FROM scan_history WHERE LOWER(status) LIKE '%fraud%' OR LOWER(status) LIKE '%malicious%'");
        const totalFraud = fraudRows[0].count;
        const totalSafe = totalScanned - totalFraud;

        // 3. Total Users Count from users table
        const [userRows] = await pool.query('SELECT COUNT(*) as total FROM users');
        const totalUsers = userRows[0].total;

        // 4. Recent Analyzed Apps (Latest 3) from scan_history using target_url as app name
        const [recentRows] = await pool.query('SELECT target_url as app_name, status, user_email as scanned_by FROM scan_history ORDER BY id DESC LIMIT 3');

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

// --- SERVER START ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
});