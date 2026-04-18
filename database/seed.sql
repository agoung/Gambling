-- Seed data for SportsAnalytics Pro

-- Insert sample sports
INSERT INTO sports (name, slug, category, popularity_score) VALUES
('Basketball', 'basketball', 'team', 95),
('Football', 'football', 'team', 90),
('Baseball', 'baseball', 'team', 75),
('Soccer', 'soccer', 'team', 88),
('Tennis', 'tennis', 'individual', 70),
('Esports', 'esports', 'esports', 85),
('Hockey', 'hockey', 'team', 65),
('Golf', 'golf', 'individual', 60)
ON CONFLICT (slug) DO NOTHING;

-- Insert sample entities (teams/players)
WITH sports_ids AS (SELECT id, slug FROM sports)
INSERT INTO entities (sport_id, entity_type, name, slug, current_form_rating, volatility_index, trending_score, metadata)
SELECT 
    s.id,
    'team',
    team.name,
    team.slug,
    team.form,
    team.volatility,
    team.trending,
    jsonb_build_object('city', team.city, 'founded', team.founded)
FROM sports_ids s
CROSS JOIN LATERAL (VALUES
    ('Los Angeles Lakers', 'lakers', 8.5, 12.5, 85, 'Los Angeles', 1947),
    ('Golden State Warriors', 'warriors', 9.2, 15.2, 92, 'San Francisco', 1946),
    ('Boston Celtics', 'celtics', 8.8, 11.8, 88, 'Boston', 1946),
    ('Miami Heat', 'heat', 7.5, 14.5, 75, 'Miami', 1988),
    ('Phoenix Suns', 'suns', 8.0, 13.0, 80, 'Phoenix', 1968)
) AS team(name, slug, form, volatility, trending, city, founded)
WHERE s.slug = 'basketball'
UNION ALL
SELECT 
    s.id,
    'team',
    team.name,
    team.slug,
    team.form,
    team.volatility,
    team.trending,
    jsonb_build_object('city', team.city, 'founded', team.founded)
FROM sports_ids s
CROSS JOIN LATERAL (VALUES
    ('Kansas City Chiefs', 'chiefs', 9.5, 10.5, 95, 'Kansas City', 1960),
    ('San Francisco 49ers', '49ers', 8.8, 11.2, 88, 'San Francisco', 1946),
    ('Baltimore Ravens', 'ravens', 8.5, 12.0, 85, 'Baltimore', 1996),
    ('Buffalo Bills', 'bills', 8.2, 13.5, 82, 'Buffalo', 1960),
    ('Philadelphia Eagles', 'eagles', 7.8, 14.2, 78, 'Philadelphia', 1933)
) AS team(name, slug, form, volatility, trending, city, founded)
WHERE s.slug = 'football'
UNION ALL
SELECT 
    s.id,
    'team',
    team.name,
    team.slug,
    team.form,
    team.volatility,
    team.trending,
    jsonb_build_object('city', team.city, 'founded', team.founded)
FROM sports_ids s
CROSS JOIN LATERAL (VALUES
    ('Manchester City', 'man-city', 9.4, 8.5, 94, 'Manchester', 1880),
    ('Arsenal', 'arsenal', 8.9, 9.2, 89, 'London', 1886),
    ('Liverpool', 'liverpool', 8.7, 9.8, 87, 'Liverpool', 1892),
    ('Real Madrid', 'real-madrid', 9.1, 8.8, 91, 'Madrid', 1902),
    ('Barcelona', 'barcelona', 8.5, 10.5, 85, 'Barcelona', 1899)
) AS team(name, slug, form, volatility, trending, city, founded)
WHERE s.slug = 'soccer'
ON CONFLICT (sport_id, slug, entity_type) DO NOTHING;

-- Insert sample events
WITH teams AS (SELECT id, name, sport_id FROM entities WHERE entity_type = 'team')
INSERT INTO events (sport_id, home_entity_id, away_entity_id, scheduled_at, status, home_probability, away_probability, total_score_prediction)
SELECT 
    t1.sport_id,
    t1.id,
    t2.id,
    NOW() + (random() * INTERVAL '7 days'),
    CASE WHEN random() > 0.7 THEN 'live' ELSE 'upcoming' END,
    50 + (random() * 20 - 10),
    50 + (random() * 20 - 10),
    100 + (random() * 50)
FROM teams t1
JOIN teams t2 ON t1.sport_id = t2.sport_id AND t1.id != t2.id
WHERE random() < 0.3
ON CONFLICT DO NOTHING;

-- Create sample user (for testing - password is 'TestPassword123!')
INSERT INTO users (username, email, password_hash, first_name, last_name, virtual_balance, email_verified)
VALUES (
    'demo_user',
    'demo@sportsanalytics.pro',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/I1m',
    'Demo',
    'User',
    10000.00,
    true
)
ON CONFLICT (username) DO NOTHING;
