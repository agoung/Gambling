const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const portfolioRoutes = require('./routes/portfolio');
const analyticsRoutes = require('./routes/analytics');
const marketRoutes = require('./routes/market');
const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Setup Redis Client
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Error nih bos:', err));
redisClient.connect();

// Socket.IO dengan Redis Adapter buat scaling
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Security Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));

// Rate Limiting - biar gak diserang
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // maks 100 request per IP
    message: { error: 'Kebanyakan request nih, santai dulu bos!' }
});
app.use(limiter);

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Attach Redis ke request
app.use((req, res, next) => {
    req.redis = redisClient;
    req.io = io;
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', authMiddleware, portfolioRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/market', marketRoutes);

// Health Check - cek sehat gak nih server
app.get('/health', (req, res) => {
    res.json({ 
        status: 'sehat walafiat', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// WebSocket Authentication & Connection Handling
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Token mana bos?'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        socket.username = decoded.username;

        // Simpan connection di Redis
        await redisClient.sAdd(`user:${decoded.userId}:sockets`, socket.id);
        next();
    } catch (err) {
        next(new Error('Autentikasi gagal nih'));
    }
});

io.on('connection', (socket) => {
    console.log(`🔌 User ${socket.username} nyambung: ${socket.id}`);

    // Join room user sendiri
    socket.join(`user:${socket.userId}`);

    // Join room pasar publik
    socket.join('market:live');

    // Handle subscription ke update player/team
    socket.on('subscribe', async (data) => {
        if (data.type === 'player') {
            socket.join(`player:${data.id}`);
            const stats = await redisClient.hGetAll(`player:${data.id}:stats`);
            socket.emit('player:update', { playerId: data.id, stats });
        }
        if (data.type === 'portfolio') {
            socket.join(`portfolio:${socket.userId}`);
        }
    });

    socket.on('disconnect', async () => {
        await redisClient.sRem(`user:${socket.userId}:sockets`, socket.id);
        console.log(`👋 User ${socket.username} cabut`);
    });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown - matiin dengan sopan
process.on('SIGTERM', async () => {
    console.log('SIGTERM diterima, matiin server dengan sopan...');
    server.close(() => {
        console.log('HTTP server udah tutup');
    });
    await redisClient.quit();
    process.exit(0);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Server SportsAnalytics Pro jalan di port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔥 Siap melayani request dengan gaya!`);
});

module.exports = { io, redisClient };
