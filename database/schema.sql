-- Fantasy Sports Analytics Database Schema
-- High-performance PostgreSQL schema with gambling-site architecture patterns

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Users table with KYC-style verification (like gambling sites)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    -- Profile & Verification (KYC-style)
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    country VARCHAR(2),
    date_of_birth DATE,
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    identity_verified BOOLEAN DEFAULT FALSE,

    -- Account status (gambling-site style risk management)
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned', 'pending')),
    risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),

    -- Balance & Limits (like gambling wallet)
    virtual_balance DECIMAL(15, 2) DEFAULT 10000.00, -- Virtual currency for fantasy
    daily_analysis_limit INTEGER DEFAULT 100,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,

    -- Indexes for performance
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Sports/Leagues catalog (like casino games catalog)
CREATE TABLE sports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50), -- team, individual, esports
    is_active BOOLEAN DEFAULT TRUE,
    popularity_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams/Players (the "assets" to analyze)
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sport_id UUID REFERENCES sports(id),
    entity_type VARCHAR(20) CHECK (entity_type IN ('team', 'player')),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    external_id VARCHAR(50), -- API reference ID

    -- Market data (real-time odds-style)
    current_form_rating DECIMAL(4, 2), -- 0.00 to 10.00
    volatility_index DECIMAL(5, 2), -- Like betting odds volatility
    trending_score DECIMAL(5, 2), -- Social media trend

    -- Metadata
    metadata JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(sport_id, slug, entity_type)
);

-- Matches/Events (like gambling events)
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sport_id UUID REFERENCES sports(id),
    event_type VARCHAR(50), -- match, tournament, season

    -- Participants
    home_entity_id UUID REFERENCES entities(id),
    away_entity_id UUID REFERENCES entities(id),

    -- Event details
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    venue VARCHAR(100),
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed', 'postponed', 'cancelled')),

    -- Analytics data (odds-style metrics)
    home_probability DECIMAL(5, 2), -- Calculated win probability
    away_probability DECIMAL(5, 2),
    draw_probability DECIMAL(5, 2),
    total_score_prediction DECIMAL(5, 2),

    -- Live data
    live_data JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Portfolios (like betting slips/portfolios)
CREATE TABLE portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Portfolio composition
    strategy_type VARCHAR(50), -- value, momentum, contrarian, etc.
    risk_profile VARCHAR(20) CHECK (risk_profile IN ('conservative', 'balanced', 'aggressive')),

    -- Performance metrics (gambling-site style P&L tracking)
    total_invested DECIMAL(15, 2) DEFAULT 0,
    current_value DECIMAL(15, 2) DEFAULT 0,
    total_return_pct DECIMAL(7, 2) DEFAULT 0,

    -- Analytics
    sharpe_ratio DECIMAL(5, 2),
    max_drawdown DECIMAL(5, 2),
    win_rate DECIMAL(5, 2),

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Portfolio Holdings (positions)
CREATE TABLE portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portfolio_id UUID REFERENCES portfolios(id),
    entity_id UUID REFERENCES entities(id),

    -- Position details
    position_type VARCHAR(20) CHECK (position_type IN ('long', 'short', 'analysis')),
    quantity DECIMAL(10, 2) DEFAULT 1,
    entry_price DECIMAL(10, 2), -- Virtual price at entry
    current_price DECIMAL(10, 2),

    -- Performance
    unrealized_pnl DECIMAL(10, 2),
    unrealized_pnl_pct DECIMAL(7, 2),

    -- Analytics
    confidence_score DECIMAL(5, 2), -- AI prediction confidence
    expected_return DECIMAL(7, 2),

    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

-- Transactions (like gambling transaction history)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    portfolio_id UUID REFERENCES portfolios(id),

    -- Transaction details
    transaction_type VARCHAR(50) CHECK (transaction_type IN ('deposit', 'withdrawal', 'position_open', 'position_close', 'dividend', 'fee')),
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'VIRTUAL',

    -- Reference data
    entity_id UUID REFERENCES entities(id),
    metadata JSONB,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),

    -- Audit trail (gambling-site compliance style)
    ip_address INET,
    user_agent TEXT,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time Statistics (materialized view for performance)
CREATE MATERIALIZED VIEW entity_statistics AS
SELECT 
    e.id,
    e.name,
    e.entity_type,
    s.name as sport_name,
    e.current_form_rating,
    e.volatility_index,
    COUNT(DISTINCT ev.id) as total_events,
    AVG(CASE WHEN ev.status = 'completed' THEN ev.home_probability END) as avg_home_prob,
    MAX(ph.current_price) as latest_price,
    COUNT(DISTINCT ph.portfolio_id) as portfolio_count
FROM entities e
JOIN sports s ON e.sport_id = s.id
LEFT JOIN events ev ON (ev.home_entity_id = e.id OR ev.away_entity_id = e.id)
LEFT JOIN portfolio_holdings ph ON ph.entity_id = e.id
GROUP BY e.id, e.name, e.entity_type, s.name, e.current_form_rating, e.volatility_index;

-- Create indexes for high-performance queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_entities_sport ON entities(sport_id);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_scheduled ON events(scheduled_at);
CREATE INDEX idx_events_live ON events(status) WHERE status = 'live';
CREATE INDEX idx_portfolios_user ON portfolios(user_id);
CREATE INDEX idx_holdings_portfolio ON portfolio_holdings(portfolio_id);
CREATE INDEX idx_holdings_entity ON portfolio_holdings(entity_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(created_at DESC);

-- Refresh statistics every 5 minutes (like live odds updates)
CREATE OR REPLACE FUNCTION refresh_statistics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY entity_statistics;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data
INSERT INTO sports (name, slug, category) VALUES
('Basketball', 'basketball', 'team'),
('Football', 'football', 'team'),
('Baseball', 'baseball', 'team'),
('Soccer', 'soccer', 'team'),
('Tennis', 'tennis', 'individual'),
('Esports', 'esports', 'esports');
