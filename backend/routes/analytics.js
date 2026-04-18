const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Get user analytics dashboard (like gambling account history)
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.user.userId;

        // Portfolio performance summary
        const portfolioStats = await pool.query(
            `SELECT 
                COUNT(*) as total_portfolios,
                SUM(current_value) as total_current_value,
                SUM(total_invested) as total_invested,
                SUM(current_value - total_invested) as total_pnl,
                CASE WHEN SUM(total_invested) > 0 
                     THEN ((SUM(current_value) - SUM(total_invested)) / SUM(total_invested)) * 100 
                     ELSE 0 END as total_return_pct,
                AVG(sharpe_ratio) as avg_sharpe_ratio
             FROM portfolios
             WHERE user_id = $1 AND is_active = true`,
            [userId]
        );

        // Trading activity (like betting history)
        const activity = await pool.query(
            `SELECT 
                DATE_TRUNC('day', created_at) as date,
                COUNT(*) as transaction_count,
                SUM(CASE WHEN transaction_type = 'position_open' THEN 1 ELSE 0 END) as positions_opened,
                SUM(CASE WHEN transaction_type = 'position_close' THEN 1 ELSE 0 END) as positions_closed,
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as gains,
                SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as losses
             FROM transactions
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
             GROUP BY DATE_TRUNC('day', created_at)
             ORDER BY date DESC`,
            [userId]
        );

        // Risk metrics
        const riskMetrics = await pool.query(
            `SELECT 
                risk_profile,
                COUNT(*) as count,
                AVG(current_value) as avg_value,
                AVG(CASE WHEN total_invested > 0 
                    THEN (current_value - total_invested) / total_invested * 100 
                    ELSE 0 END) as avg_return
             FROM portfolios
             WHERE user_id = $1 AND is_active = true
             GROUP BY risk_profile`,
            [userId]
        );

        // Top performing positions
        const topPositions = await pool.query(
            `SELECT ph.*, e.name as entity_name, s.name as sport_name,
                    ((ph.current_price - ph.entry_price) / ph.entry_price) * 100 as return_pct
             FROM portfolio_holdings ph
             JOIN entities e ON ph.entity_id = e.id
             JOIN sports s ON e.sport_id = s.id
             JOIN portfolios p ON ph.portfolio_id = p.id
             WHERE p.user_id = $1 AND ph.status = 'open'
             ORDER BY return_pct DESC
             LIMIT 10`,
            [userId]
        );

        res.json({
            summary: portfolioStats.rows[0],
            recentActivity: activity.rows,
            riskDistribution: riskMetrics.rows,
            topPositions: topPositions.rows,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Get detailed performance report (like gambling P&L statement)
router.get('/performance', async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const userId = req.user.userId;

        let interval;
        switch(period) {
            case '7d': interval = '7 days'; break;
            case '30d': interval = '30 days'; break;
            case '90d': interval = '90 days'; break;
            case '1y': interval = '1 year'; break;
            default: interval = '30 days';
        }

        // Performance by sport
        const sportPerformance = await pool.query(
            `SELECT 
                s.name as sport,
                COUNT(ph.id) as positions,
                SUM(ph.quantity * ph.current_price) as current_value,
                SUM(ph.quantity * ph.entry_price) as invested,
                SUM(ph.quantity * (ph.current_price - ph.entry_price)) as pnl,
                AVG(ph.confidence_score) as avg_confidence
             FROM portfolio_holdings ph
             JOIN entities e ON ph.entity_id = e.id
             JOIN sports s ON e.sport_id = s.id
             JOIN portfolios p ON ph.portfolio_id = p.id
             WHERE p.user_id = $1 AND ph.status = 'open'
             GROUP BY s.name
             ORDER BY pnl DESC`,
            [userId]
        );

        // Win/loss ratio (like betting win rate)
        const winLoss = await pool.query(
            `SELECT 
                COUNT(CASE WHEN amount > 0 THEN 1 END) as winning_positions,
                COUNT(CASE WHEN amount < 0 THEN 1 END) as losing_positions,
                COUNT(CASE WHEN amount = 0 THEN 1 END) as break_even,
                AVG(CASE WHEN amount > 0 THEN amount END) as avg_win,
                AVG(CASE WHEN amount < 0 THEN amount END) as avg_loss,
                SUM(amount) as net_pnl
             FROM transactions
             WHERE user_id = $1 AND transaction_type = 'position_close'
               AND created_at > NOW() - INTERVAL '${interval}'`,
            [userId]
        );

        // Monthly trend
        const monthlyTrend = await pool.query(
            `SELECT 
                DATE_TRUNC('month', created_at) as month,
                SUM(amount) as net_pnl,
                COUNT(*) as closed_positions
             FROM transactions
             WHERE user_id = $1 AND transaction_type = 'position_close'
             GROUP BY DATE_TRUNC('month', created_at)
             ORDER BY month DESC
             LIMIT 12`,
            [userId]
        );

        res.json({
            period,
            sportBreakdown: sportPerformance.rows,
            winLossStats: winLoss.rows[0],
            monthlyTrend: monthlyTrend.rows
        });
    } catch (error) {
        console.error('Error fetching performance:', error);
        res.status(500).json({ error: 'Failed to fetch performance data' });
    }
});

module.exports = router;
