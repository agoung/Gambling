const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { logger } = require('../middleware/errorHandler');

const router = express.Router();

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Rate limiting ketat buat auth - biar gak dihack
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 5, // 5 kali coba per 15 menit
    skipSuccessfulRequests: true,
    message: { error: 'Kebanyakan nyoba login nih, chill dulu 15 menit ya!' }
});

// Validasi input - biar datanya bener
const registerValidation = [
    body('username')
        .isLength({ min: 3, max: 50 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username minimal 3 karakter, alphanumeric aja ya bos'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Emailnya yang bener dong'),
    body('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password minimal 8 karakter, ada huruf besar, kecil, angka, dan simbol'),
    body('firstName').optional().trim().escape(),
    body('lastName').optional().trim().escape(),
    body('country').optional().isLength({ min: 2, max: 2 })
];

const loginValidation = [
    body('username').trim().notEmpty(),
    body('password').notEmpty()
];

// Register endpoint - daftar akun baru
router.post('/register', authLimiter, registerValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, password, firstName, lastName, country } = req.body;

        // Cek user udah ada belum
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Username atau email udah dipake bos!' });
        }

        // Hash password - biar aman
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Buat user dengan saldo awal $10.000 - modal mainnya nih
        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, country, virtual_balance)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, username, email, virtual_balance, created_at`,
            [username, email, passwordHash, firstName, lastName, country, 10000.00]
        );

        const user = result.rows[0];

        // Log registrasi - buat catetan
        logger.info({
            event: 'USER_REGISTERED',
            userId: user.id,
            username: user.username,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username,
                status: 'active'
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Registrasi sukses bos! Selamat datang di klub',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                virtualBalance: user.virtual_balance,
                createdAt: user.created_at
            }
        });

    } catch (error) {
        logger.error({ event: 'REGISTER_ERROR', error: error.message, ip: req.ip });
        res.status(500).json({ error: 'Registrasi gagal nih, coba lagi ya' });
    }
});

// Login endpoint - masuk ke akun
router.post('/login', authLimiter, loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;

        // Ambil data user
        const result = await pool.query(
            `SELECT id, username, email, password_hash, status, risk_level, 
                    virtual_balance, last_login_at, failed_login_attempts
             FROM users 
             WHERE LOWER(username) = LOWER($1)`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Username atau password salah bos' });
        }

        const user = result.rows[0];

        // Cek status akun
        if (user.status !== 'active') {
            logger.warn({
                event: 'LOGIN_BLOCKED',
                userId: user.id,
                reason: user.status,
                ip: req.ip
            });
            return res.status(403).json({ error: 'Akun lu gak aktif nih, hubungi admin ya' });
        }

        // Verifikasi password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            // Tambahin failed attempts
            await pool.query(
                'UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = $1',
                [user.id]
            );

            logger.warn({
                event: 'LOGIN_FAILED',
                userId: user.id,
                ip: req.ip,
                reason: 'password_salah'
            });

            return res.status(401).json({ error: 'Username atau password salah bos' });
        }

        // Reset failed attempts dan update last login
        await pool.query(
            `UPDATE users 
             SET failed_login_attempts = 0, 
                 last_login_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [user.id]
        );

        // Log sukses login
        logger.info({
            event: 'LOGIN_SUCCESS',
            userId: user.id,
            username: user.username,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username,
                status: user.status,
                riskLevel: user.risk_level
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login sukses! Selamat datang kembali bos',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                virtualBalance: user.virtual_balance,
                riskLevel: user.risk_level,
                lastLoginAt: user.last_login_at
            }
        });

    } catch (error) {
        logger.error({ event: 'LOGIN_ERROR', error: error.message, ip: req.ip });
        res.status(500).json({ error: 'Login gagal nih, coba lagi ya' });
    }
});

// Logout endpoint - blacklist token
router.post('/logout', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            // Blacklist token di Redis sampe expired
            const decoded = jwt.decode(token);
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);

            if (ttl > 0) {
                await req.redis.setEx(`blacklist:${token}`, ttl, 'revoked');
            }

            logger.info({
                event: 'LOGOUT',
                userId: decoded?.userId,
                ip: req.ip
            });
        }

        res.json({ message: 'Logout sukses! Sampai jumpa lagi bos' });
    } catch (error) {
        res.status(500).json({ error: 'Logout gagal nih' });
    }
});

// Refresh token - perpanjang sesi
router.post('/refresh', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token mana nih bos?' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });

        // Cek user masih aktif gak
        const userResult = await pool.query(
            'SELECT status FROM users WHERE id = $1',
            [decoded.userId]
        );

        if (userResult.rows.length === 0 || userResult.rows[0].status !== 'active') {
            return res.status(403).json({ error: 'Akun udah gak aktif nih bos' });
        }

        // Generate token baru
        const newToken = jwt.sign(
            { 
                userId: decoded.userId, 
                username: decoded.username,
                status: decoded.status
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'Token berhasil diperpanjang',
            token: newToken 
        });

    } catch (error) {
        res.status(401).json({ error: 'Token invalid bos' });
    }
});

module.exports = router;
