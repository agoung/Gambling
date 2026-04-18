const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Get live market overview (like gambling lobby)
router.get('/overview', async (req, res) => {
    try {
        // Get trending entities (hot "bets")
        const trending = await pool.query(
            `SELECT e.*, s.name as sport_name, s.slug as sport_slug,
                    COUNT(ph.id) as active_positions,
                    AVG(ph.confidence_score) as avg_confidence
             FROM entities e
             JOIN sports s ON e.sport_id = s.id
             LEFT JOIN portfolio_holdings ph ON e.id = ph.entity_id AND ph.status = 'open'
             WHERE e.is_active = true
             GROUP BY e.id, s.name, s.slug
             ORDER BY e.trending_score DESC
             LIMIT 20`
        );

        // Get live events (live matches)
        const liveEvents = await pool.query(
            `SELECT e.*, 
                    home.name as home_name, away.name as away_name,
                    s.name as sport_name
             FROM events e
             JOIN entities home ON e.home_entity_id = home.id
             JOIN entities away ON e.away_entity_id = away.id
             JOIN sports s ON e.sport_id = s.id
             WHERE e.status = 'live'
             ORDER BY e.scheduled_at
             LIMIT 10`
        );

        // Get upcoming events
        const upcoming = await pool.query(
            `SELECT e.*, 
                    home.name as home_name, away.name as away_name,
                    s.name as sport_name
             FROM events e
             JOIN entities home ON e.home_entity_id = home.id
             JOIN entities away ON e.away_entity_id = away.id
             JOIN sports s ON e.sport_id = s.id
             WHERE e.status = 'upcoming' AND e.scheduled_at > NOW()
             ORDER BY e.scheduled_at
             LIMIT 20`
        );

        // Market statistics
        const stats = await pool.query(
            `SELECT 
                COUNT(DISTINCT e.id) as total_entities,
                COUNT(DISTINCT CASE WHEN ev.status = 'live' THEN ev.id END) as live_events,
                COUNT(DISTINCT ph.id) as total_active_positions,
                SUM(CASE WHEN ph.status = 'open' THEN ph.quantity * ph.current_price ELSE 0 END) as total_market_volume
             FROM entities e
             LEFT JOIN events ev ON ev.sport_id = e.sport_id
             LEFT JOIN portfolio_holdings ph ON ph.entity_id = e.id`
        );

        res.json({
            trending: trending.rows,
            liveEvents: liveEvents.rows,
            upcoming: upcoming.rows,
            marketStats: stats.rows[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching market overview:', error);
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});

// Get entity details with analytics (like odds page)
router.get('/entities/:entityId', async (req, res) => {
    try {
        const { entityId } = req.params;

        // Entity details
        const entityResult = await pool.query(
            `SELECT e.*, s.name as sport_name, s.category as sport_category
             FROM entities e
             JOIN sports s ON e.sport_id = s.id
             WHERE e.id = $1`,
            [entityId]
        );

        if (entityResult.rows.length === 0) {
            return res.status(404).json({ error: 'Entity not found' });
        }

        // Historical performance (simulated)
        const history = await pool.query(
            `SELECT 
                DATE_TRUNC('day', created_at) as date,
                AVG(current_form_rating) as avg_rating,
                COUNT(*) as event_count
             FROM events
             WHERE (home_entity_id = $1 OR away_entity_id = $1) 
               AND created_at > NOW() - INTERVAL '30 days'
             GROUP BY DATE_TRUNC('day', created_at)
             ORDER BY date DESC`,
            [entityId]
        );

        // Current portfolio exposure
        const exposure = await pool.query(
            `SELECT 
                SUM(CASE WHEN position_type = 'long' THEN quantity * current_price ELSE 0 END) as long_exposure,
                SUM(CASE WHEN position_type = 'short' THEN quantity * current_price ELSE 0 END) as short_exposure,
                COUNT(DISTINCT portfolio_id) as portfolio_count,
                AVG(confidence_score) as avg_confidence
             FROM portfolio_holdings
             WHERE entity_id = $1 AND status = 'open'`,
            [entityId]
        );

        // Upcoming events for this entity
        const events = await pool.query(
            `SELECT e.*, 
                    opponent.name as opponent_name,
                    CASE WHEN e.home_entity_id = $1 THEN 'home' ELSE 'away' END as side
             FROM events e
             JOIN entities opponent ON 
                (e.home_entity_id = $1 AND e.away_entity_id = opponent.id) OR
                (e.away_entity_id = $1 AND e.home_entity_id = opponent.id)
             WHERE e.status = 'upcoming' AND e.scheduled_at > NOW()
             ORDER BY e.scheduled_at
             LIMIT 5`,
            [entityId]
        );

        res.json({
            entity: entityResult.rows[0],
            performanceHistory: history.rows,
            marketExposure: exposure.rows[0],
            upcomingEvents: events.rows,
            analytics: {
                volatilityIndex: entityResult.rows[0].volatility_index,
                formRating: entityResult.rows[0].current_form_rating,
                trendingScore: entityResult.rows[0].trending_score,
                sentiment: exposure.rows[0].avg_confidence > 70 ? 'bullish' : 
                          exposure.rows[0].avg_confidence < 40 ? 'bearish' : 'neutral'
            }
        });
    } catch (error) {
        console.error('Error fetching entity details:', error);
        res.status(500).json({ error: 'Failed to fetch entity details' });
    }
});

// Search entities (like finding teams/players to "bet" on)
router.get('/search', async (req, res) => {
    try {
        const { q, sport, type } = req.query;

        let query = `
            SELECT e.*, s.name as sport_name
            FROM entities e
            JOIN sports s ON e.sport_id = s.id
            WHERE e.is_active = true
        `;
        const params = [];
        let paramCount = 0;

        if (q) {
            paramCount++;
            query += ` AND (e.name ILIKE $${paramCount} OR e.slug ILIKE $${paramCount})`;
            params.push(`%${q}%`);
        }

        if (sport) {
            paramCount++;
            query += ` AND s.slug = $${paramCount}`;
            params.push(sport);
        }

        if (type) {
            paramCount++;
            query += ` AND e.entity_type = $${paramCount}`;
            params.push(type);
        }

        query += ` ORDER BY e.popularity_score DESC, e.name LIMIT 50`;

        const result = await pool.query(query, params);
        res.json({ entities: result.rows });
    } catch (error) {
        console.error('Error searching entities:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Get live odds-style probabilities for an event
router.get('/events/:eventId/probabilities', async (req, res) => {
    try {
        const { eventId } = req.params;

        const result = await pool.query(
            `SELECT 
                e.*,
                home.name as home_name,
                away.name as away_name,
                home.current_form_rating as home_form,
                away.current_form_rating as away_form,
                home.volatility_index as home_volatility,
                away.volatility_index as away_volatility
             FROM events e
             JOIN entities home ON e.home_entity_id = home.id
             JOIN entities away ON e.away_entity_id = away.id
             WHERE e.id = $1`,
            [eventId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const event = result.rows[0];

        // Calculate implied probabilities from form ratings
        const homeStrength = event.home_form || 5;
        const awayStrength = event.away_form || 5;
        const totalStrength = homeStrength + awayStrength;

        const homeProb = (homeStrength / totalStrength) * 100;
        const awayProb = (awayStrength / totalStrength) * 100;
        const drawProb = 100 - homeProb - awayProb;

        // Adjust for volatility (uncertainty)
        const avgVolatility = ((event.home_volatility || 10) + (event.away_volatility || 10)) / 2;
        const uncertaintyFactor = avgVolatility / 100;

        res.json({
            event: {
                id: event.id,
                homeName: event.home_name,
                awayName: event.away_name,
                scheduledAt: event.scheduled_at,
                status: event.status
            },
            probabilities: {
                homeWin: Math.round(homeProb * 100) / 100,
                awayWin: Math.round(awayProb * 100) / 100,
                draw: Math.round(Math.max(0, drawProb) * 100) / 100,
                uncertaintyIndex: Math.round(uncertaintyFactor * 100) / 100
            },
            predictions: {
                expectedTotalScore: event.total_score_prediction,
                confidence: Math.round((100 - avgVolatility) * 100) / 100
            }
        });
    } catch (error) {
        console.error('Error calculating probabilities:', error);
        res.status(500).json({ error: 'Failed to calculate probabilities' });
    }
});

module.exports = router;
