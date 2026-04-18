const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Rate limit buat operasi portfolio - biar gak spam
const portfolioLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 menit
    max: 30, // 30 operasi per menit
    message: { error: 'Kebanyakan gerak nih bos, santai dulu ya!' }
});

// Ambil semua portfolio user
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, 
                    COUNT(ph.id) as total_positions,
                    SUM(CASE WHEN ph.status = 'open' THEN 1 ELSE 0 END) as open_positions
             FROM portfolios p
             LEFT JOIN portfolio_holdings ph ON p.id = ph.portfolio_id
             WHERE p.user_id = $1 AND p.is_active = true
             GROUP BY p.id
             ORDER BY p.created_at DESC`,
            [req.user.userId]
        );

        res.json({ portfolios: result.rows });
    } catch (error) {
        console.error('Error ambil portfolio:', error);
        res.status(500).json({ error: 'Gagal ambil data portfolio nih bos' });
    }
});

// Bikin portfolio baru - modal investasi baru
router.post('/', portfolioLimiter, [
    body('name').isLength({ min: 1, max: 100 }).trim(),
    body('description').optional().isLength({ max: 500 }).trim(),
    body('strategyType').optional().isIn(['value', 'momentum', 'contrarian', 'balanced']),
    body('riskProfile').optional().isIn(['conservative', 'balanced', 'aggressive'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, description, strategyType = 'balanced', riskProfile = 'balanced' } = req.body;

        // Cek limit portfolio per user - jangan rakus
        const countResult = await pool.query(
            'SELECT COUNT(*) as count FROM portfolios WHERE user_id = $1 AND is_active = true',
            [req.user.userId]
        );

        if (parseInt(countResult.rows[0].count) >= 10) {
            return res.status(400).json({ error: 'Portfolio lu udah kebanyakan bos, maksimal 10 aja ya!' });
        }

        const result = await pool.query(
            `INSERT INTO portfolios (user_id, name, description, strategy_type, risk_profile)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [req.user.userId, name, description, strategyType, riskProfile]
        );

        // Log pembuatan - catet history
        await pool.query(
            `INSERT INTO transactions (user_id, transaction_type, amount, metadata)
             VALUES ($1, 'deposit', 0, $2)`,
            [req.user.userId, JSON.stringify({ action: 'portfolio_created', portfolioId: result.rows[0].id })]
        );

        res.status(201).json({ 
            message: 'Portfolio baru berhasil dibikin bos! Siap cuan! 🚀',
            portfolio: result.rows[0] 
        });
    } catch (error) {
        console.error('Error bikin portfolio:', error);
        res.status(500).json({ error: 'Gagal bikin portfolio nih, coba lagi ya' });
    }
});

// Tambahin posisi ke portfolio - gaskeun investasi!
router.post('/:portfolioId/positions', portfolioLimiter, [
    body('entityId').isUUID(),
    body('positionType').isIn(['long', 'short', 'analysis']),
    body('quantity').isDecimal().custom(value => parseFloat(value) > 0),
    body('confidenceScore').optional().isFloat({ min: 0, max: 100 })
], async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const { portfolioId } = req.params;
        const { entityId, positionType, quantity, confidenceScore = 50, notes } = req.body;

        // Verifikasi kepemilikan portfolio
        const portfolioCheck = await client.query(
            'SELECT * FROM portfolios WHERE id = $1 AND user_id = $2',
            [portfolioId, req.user.userId]
        );

        if (portfolioCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Portfolio gak ketemu nih bos' });
        }

        const portfolio = portfolioCheck.rows[0];

        // Ambil harga entity saat ini (data pasar real-time)
        const entityResult = await client.query(
            'SELECT current_form_rating FROM entities WHERE id = $1',
            [entityId]
        );

        if (entityResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Entity gak ketemu nih bos' });
        }

        // Kalkulasi harga virtual berdasarkan form rating (0-10)
        const basePrice = 100;
        const formRating = entityResult.rows[0].current_form_rating || 5;
        const currentPrice = basePrice * (formRating / 5);

        // Cek posisi udah ada belum
        const existingPos = await client.query(
            'SELECT * FROM portfolio_holdings WHERE portfolio_id = $1 AND entity_id = $2 AND status = $3',
            [portfolioId, entityId, 'open']
        );

        let position;

        if (existingPos.rows.length > 0) {
            // Update posisi yang udah ada (averaging)
            const existing = existingPos.rows[0];
            const newQuantity = parseFloat(existing.quantity) + parseFloat(quantity);
            const newEntryPrice = ((existing.entry_price * existing.quantity) + (currentPrice * quantity)) / newQuantity;

            const updateResult = await client.query(
                `UPDATE portfolio_holdings 
                 SET quantity = $1, entry_price = $2, current_price = $3, updated_at = NOW()
                 WHERE id = $4
                 RETURNING *`,
                [newQuantity, newEntryPrice, currentPrice, existing.id]
            );
            position = updateResult.rows[0];
        } else {
            // Bikin posisi baru
            const insertResult = await client.query(
                `INSERT INTO portfolio_holdings 
                 (portfolio_id, entity_id, position_type, quantity, entry_price, current_price, confidence_score)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [portfolioId, entityId, positionType, quantity, currentPrice, currentPrice, confidenceScore]
            );
            position = insertResult.rows[0];
        }

        // Update total portfolio
        const totalInvested = parseFloat(portfolio.total_invested || 0) + (currentPrice * parseFloat(quantity));
        await client.query(
            'UPDATE portfolios SET total_invested = $1, updated_at = NOW() WHERE id = $2',
            [totalInvested, portfolioId]
        );

        // Catet transaksi
        await client.query(
            `INSERT INTO transactions (user_id, portfolio_id, transaction_type, amount, entity_id, metadata)
             VALUES ($1, $2, 'position_open', $3, $4, $5)`,
            [req.user.userId, portfolioId, currentPrice * parseFloat(quantity), entityId, 
             JSON.stringify({ positionType, quantity, price: currentPrice, confidenceScore })]
        );

        await client.query('COMMIT');

        // Kirim update real-time via WebSocket
        req.io.to(`portfolio:${req.user.userId}`).emit('position:opened', {
            portfolioId,
            position,
            timestamp: new Date().toISOString()
        });

        res.status(201).json({ 
            message: 'Posisi berhasil dibuka bos! Gaskeun cuan! 📈',
            position 
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error buka posisi:', error);
        res.status(500).json({ error: 'Gagal buka posisi nih bos, coba lagi ya' });
    } finally {
        client.release();
    }
});

// Ambil detail portfolio sama posisinya
router.get('/:portfolioId', async (req, res) => {
    try {
        const { portfolioId } = req.params;

        // Ambil portfolio
        const portfolioResult = await pool.query(
            `SELECT p.*, u.username as owner_username
             FROM portfolios p
             JOIN users u ON p.user_id = u.id
             WHERE p.id = $1 AND (p.user_id = $2 OR p.is_public = true)`,
            [portfolioId, req.user.userId]
        );

        if (portfolioResult.rows.length === 0) {
            return res.status(404).json({ error: 'Portfolio gak ketemu nih bos' });
        }

        // Ambil posisi dengan detail entity
        const positionsResult = await pool.query(
            `SELECT ph.*, e.name as entity_name, e.entity_type, s.name as sport_name,
                    e.current_form_rating, e.volatility_index
             FROM portfolio_holdings ph
             JOIN entities e ON ph.entity_id = e.id
             JOIN sports s ON e.sport_id = s.id
             WHERE ph.portfolio_id = $1 AND ph.status = 'open'
             ORDER BY ph.opened_at DESC`,
            [portfolioId]
        );

        // Kalkulasi nilai portfolio saat ini
        let currentValue = 0;
        const positions = positionsResult.rows.map(pos => {
            const value = parseFloat(pos.current_price) * parseFloat(pos.quantity);
            currentValue += value;
            return {
                ...pos,
                current_value: value,
                pnl: value - (parseFloat(pos.entry_price) * parseFloat(pos.quantity)),
                pnl_pct: ((parseFloat(pos.current_price) - parseFloat(pos.entry_price)) / parseFloat(pos.entry_price)) * 100
            };
        });

        const portfolio = portfolioResult.rows[0];
        const totalReturn = currentValue - parseFloat(portfolio.total_invested || 0);
        const totalReturnPct = parseFloat(portfolio.total_invested) > 0 
            ? (totalReturn / parseFloat(portfolio.total_invested)) * 100 
            : 0;

        res.json({
            portfolio: {
                ...portfolio,
                current_value: currentValue,
                total_return: totalReturn,
                total_return_pct: totalReturnPct,
                position_count: positions.length
            },
            positions
        });
    } catch (error) {
        console.error('Error ambil detail portfolio:', error);
        res.status(500).json({ error: 'Gagal ambil detail portfolio nih bos' });
    }
});

// Tutup posisi - realizasiin profit/loss
router.post('/:portfolioId/positions/:positionId/close', portfolioLimiter, async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const { portfolioId, positionId } = req.params;

        // Verifikasi kepemilikan
        const portfolioCheck = await client.query(
            'SELECT * FROM portfolios WHERE id = $1 AND user_id = $2',
            [portfolioId, req.user.userId]
        );

        if (portfolioCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Portfolio gak ketemu nih bos' });
        }

        // Ambil posisi
        const positionResult = await client.query(
            `SELECT ph.*, e.current_form_rating 
             FROM portfolio_holdings ph
             JOIN entities e ON ph.entity_id = e.id
             WHERE ph.id = $1 AND ph.portfolio_id = $2 AND ph.status = 'open'`,
            [positionId, portfolioId]
        );

        if (positionResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Posisi gak ketemu atau udah ditutup bos' });
        }

        const position = positionResult.rows[0];

        // Kalkulasi harga penutupan berdasarkan form saat ini
        const basePrice = 100;
        const currentForm = position.current_form_rating || 5;
        const closePrice = basePrice * (currentForm / 5);

        // Kalkulasi P&L
        const entryValue = parseFloat(position.entry_price) * parseFloat(position.quantity);
        const exitValue = closePrice * parseFloat(position.quantity);
        const pnl = exitValue - entryValue;
        const pnlPct = (pnl / entryValue) * 100;

        // Tutup posisi
        await client.query(
            `UPDATE portfolio_holdings 
             SET status = 'closed', 
                 current_price = $1, 
                 unrealized_pnl = $2,
                 unrealized_pnl_pct = $3,
                 closed_at = NOW()
             WHERE id = $4`,
            [closePrice, pnl, pnlPct, positionId]
        );

        // Update nilai portfolio
        const portfolio = portfolioCheck.rows[0];
        const newValue = parseFloat(portfolio.current_value || 0) + pnl;
        await client.query(
            'UPDATE portfolios SET current_value = $1, updated_at = NOW() WHERE id = $2',
            [newValue, portfolioId]
        );

        // Catet transaksi
        await client.query(
            `INSERT INTO transactions (user_id, portfolio_id, transaction_type, amount, entity_id, metadata)
             VALUES ($1, $2, 'position_close', $3, $4, $5)`,
            [req.user.userId, portfolioId, pnl, position.entity_id,
             JSON.stringify({ positionId, entryPrice: position.entry_price, exitPrice: closePrice, pnl, pnlPct })]
        );

        await client.query('COMMIT');

        // Kirim update real-time
        req.io.to(`portfolio:${req.user.userId}`).emit('position:closed', {
            portfolioId,
            positionId,
            pnl,
            pnlPct,
            timestamp: new Date().toISOString()
        });

        const message = pnl >= 0 
            ? `Posisi ditutup! Cuan ${pnl.toFixed(2)} 🎉` 
            : `Posisi ditutup. Rugi ${Math.abs(pnl).toFixed(2)} 😢`;

        res.json({
            message,
            pnl,
            pnlPct,
            exitPrice: closePrice
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error tutup posisi:', error);
        res.status(500).json({ error: 'Gagal tutup posisi nih bos' });
    } finally {
        client.release();
    }
});

module.exports = router;
