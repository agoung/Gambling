const jwt = require('jsonwebtoken');
const { redisClient } = require('../server');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        // Check if token is blacklisted (gambling-site security pattern)
        const isBlacklisted = await redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ error: 'Token has been revoked' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check user status (gambling-site risk management)
        if (decoded.status !== 'active') {
            return res.status(403).json({ error: 'Account is not active' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
        }
        next();
    } catch {
        next();
    }
};

module.exports = { authMiddleware, optionalAuth };
