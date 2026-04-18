const { Server } = require('socket.io');
const { createClient } = require('redis');
const { Pool } = require('pg');

class RealTimeDataService {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.FRONTEND_URL || "http://localhost:3000",
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000
        });

        this.redis = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });

        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        this.setupHandlers();
        this.startDataSimulation();
    }

    setupHandlers() {
        // Authentication middleware
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) return next(new Error('Authentication required'));

                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                socket.userId = decoded.userId;
                socket.username = decoded.username;

                // Store connection in Redis
                await this.redis.sAdd(`user:${decoded.userId}:sockets`, socket.id);
                next();
            } catch (err) {
                next(new Error('Authentication failed'));
            }
        });

        this.io.on('connection', (socket) => {
            console.log(`🔌 User connected: ${socket.username} (${socket.id})`);

            // Join personal room
            socket.join(`user:${socket.userId}`);

            // Handle subscriptions
            socket.on('subscribe:market', () => {
                socket.join('market:live');
                socket.emit('market:subscribed', { message: 'Subscribed to live market updates' });
            });

            socket.on('subscribe:entity', async (entityId) => {
                socket.join(`entity:${entityId}`);

                // Send immediate data
                const entityData = await this.getEntityLiveData(entityId);
                socket.emit(`entity:${entityId}:update`, entityData);
            });

            socket.on('subscribe:portfolio', (portfolioId) => {
                socket.join(`portfolio:${portfolioId}`);
            });

            socket.on('unsubscribe', (channel) => {
                socket.leave(channel);
            });

            socket.on('disconnect', async () => {
                await this.redis.sRem(`user:${socket.userId}:sockets`, socket.id);
                console.log(`🔌 User disconnected: ${socket.username}`);
            });
        });
    }

    // Simulate live market data (like live odds changes)
    startDataSimulation() {
        // Update entity prices every 5 seconds (simulating market movement)
        setInterval(async () => {
            await this.simulateMarketMovement();
        }, 5000);

        // Update live events every 10 seconds
        setInterval(async () => {
            await this.updateLiveEvents();
        }, 10000);

        // Broadcast leaderboard updates every 30 seconds
        setInterval(async () => {
            await this.broadcastLeaderboard();
        }, 30000);
    }

    async function simulateMarketMovement() {
        try {
            // Get random entities to update
            const result = await this.pool.query(
                `SELECT id, current_form_rating, volatility_index 
                 FROM entities 
                 WHERE is_active = true 
                 ORDER BY RANDOM() 
                 LIMIT 10`
            );

            for (const entity of result.rows) {
                // Simulate price movement based on volatility
                const volatility = entity.volatility_index || 10;
                const change = (Math.random() - 0.5) * (volatility / 100);
                const newRating = Math.max(0, Math.min(10, 
                    (entity.current_form_rating || 5) + change
                ));

                // Update in database
                await this.pool.query(
                    `UPDATE entities 
                     SET current_form_rating = $1, 
                         updated_at = NOW(),
                         trending_score = trending_score + $2
                     WHERE id = $3`,
                    [newRating, change * 10, entity.id]
                );

                // Broadcast to subscribers
                this.io.to(`entity:${entity.id}`).emit('entity:update', {
                    entityId: entity.id,
                    currentFormRating: newRating,
                    change: change,
                    timestamp: new Date().toISOString()
                });
            }

            // Broadcast market overview update
            this.io.to('market:live').emit('market:tick', {
                timestamp: new Date().toISOString(),
                activeEntities: result.rows.length
            });

        } catch (error) {
            console.error('Market simulation error:', error);
        }
    }

    async function updateLiveEvents() {
        try {
            const liveEvents = await this.pool.query(
                `SELECT e.*, 
                        home.name as home_name, 
                        away.name as away_name
                 FROM events e
                 JOIN entities home ON e.home_entity_id = home.id
                 JOIN entities away ON e.away_entity_id = away.id
                 WHERE e.status = 'live'`
            );

            for (const event of liveEvents.rows) {
                // Simulate live score changes
                const homeScore = Math.floor(Math.random() * 5);
                const awayScore = Math.floor(Math.random() * 5);
                const timeElapsed = Math.floor(Math.random() * 90); // minutes

                const liveData = {
                    eventId: event.id,
                    homeScore,
                    awayScore,
                    timeElapsed,
                    status: 'live',
                    momentum: Math.random() > 0.5 ? 'home' : 'away',
                    timestamp: new Date().toISOString()
                };

                // Update database
                await this.pool.query(
                    `UPDATE events SET live_data = $1, updated_at = NOW() WHERE id = $2`,
                    [JSON.stringify(liveData), event.id]
                );

                // Broadcast to event subscribers
                this.io.to(`event:${event.id}`).emit('event:live', liveData);
            }
        } catch (error) {
            console.error('Live event update error:', error);
        }
    }

    async function broadcastLeaderboard() {
        try {
            // Top performing portfolios (like gambling leaderboard)
            const topPortfolios = await this.pool.query(
                `SELECT 
                    p.id,
                    p.name,
                    u.username as owner,
                    p.total_return_pct,
                    p.sharpe_ratio,
                    (p.current_value - p.total_invested) as pnl
                 FROM portfolios p
                 JOIN users u ON p.user_id = u.id
                 WHERE p.is_active = true AND p.total_invested > 0
                 ORDER BY p.total_return_pct DESC
                 LIMIT 20`
            );

            this.io.to('market:live').emit('leaderboard:update', {
                topPortfolios: topPortfolios.rows,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Leaderboard update error:', error);
        }
    }

    async function getEntityLiveData(entityId) {
        const result = await this.pool.query(
            `SELECT e.*, s.name as sport_name,
                    COUNT(ph.id) as active_positions,
                    AVG(ph.confidence_score) as market_sentiment
             FROM entities e
             JOIN sports s ON e.sport_id = s.id
             LEFT JOIN portfolio_holdings ph ON e.id = ph.entity_id AND ph.status = 'open'
             WHERE e.id = $1
             GROUP BY e.id, s.name`,
            [entityId]
        );

        if (result.rows.length === 0) return null;

        const entity = result.rows[0];
        return {
            id: entity.id,
            name: entity.name,
            sport: entity.sport_name,
            currentForm: entity.current_form_rating,
            volatility: entity.volatility_index,
            trendingScore: entity.trending_score,
            marketSentiment: entity.market_sentiment || 50,
            activePositions: parseInt(entity.active_positions),
            timestamp: new Date().toISOString()
        };
    }

    // Notify user of portfolio updates
    async notifyPortfolioUpdate(userId, portfolioId, update) {
        this.io.to(`user:${userId}`).emit('portfolio:update', {
            portfolioId,
            ...update,
            timestamp: new Date().toISOString()
        });
    }

    // Broadcast system message
    broadcastSystemMessage(message, type = 'info') {
        this.io.emit('system:message', {
            type,
            message,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = RealTimeDataService;
