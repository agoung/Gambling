const winston = require('winston');

// Configure logger (gambling-site compliance logging)
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'fantasy-analytics' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console()
    ]
});

const errorHandler = (err, req, res, next) => {
    // Log error with transaction ID (gambling-site audit pattern)
    const transactionId = req.headers['x-transaction-id'] || `tx-${Date.now()}`;

    logger.error({
        message: err.message,
        stack: err.stack,
        transactionId,
        userId: req.user?.userId,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent']
    });

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    res.status(err.status || 500).json({
        error: isDevelopment ? err.message : 'Internal server error',
        transactionId,
        timestamp: new Date().toISOString()
    });
};

module.exports = { errorHandler, logger };
