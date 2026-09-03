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
        user: 'fraudshield2026@gmail.com',         // Yahan apna Gmail address daalein
        pass: 'jumkfbymellmrffw'     // Google account se generate kiya hua 16-digit App Password daalein
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
            console.log('📧 Verification email sent successfully via Gmail!');
        } catch (emailError) {
            console.error('⚠️ Email sending failed via Gmail, but user is registered in DB:', emailError.message);
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

        if (password !== user.password) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        if (user.account_status === 'Banned') {
            return res.status(403).json({ message: 'Your account has been suspended by the administrator.' });
        }

        if (user.is_verified === 0 || user.is_verified === false) {
            return res.status(400).json({ message: 'Please verify your account using OTP first.' });
        }

        res.status(200).json({
            success: true,
            userName: user.full_name,
            role: user.role 
        });
    } catch (err) {
        console.error("Login Error:", err);
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

        console.log("-----------------------------------------");
        console.log(`🔑 PASSWORD RESET OTP FOR [${email}]: ${otp}`);
        console.log("-----------------------------------------");

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
            console.log('📧 Password reset email sent successfully via Gmail!');
        } catch (emailError) {
            console.error('⚠️ Email sending failed, but OTP is generated:', emailError.message);
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
        res.redirect(`/dashboard.html?oauth=true&name=${encodeURIComponent(req.user.full_name)}&role=${req.user.role}`); 
    }
);

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', 
    passport.authenticate('github', { failureRedirect: '/login.html' }),
    (req, res) => { 
        res.redirect(`/dashboard.html?oauth=true&name=${encodeURIComponent(req.user.full_name)}&role=${req.user.role}`); 
    }
);

// --- SERVER START ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
});