// SportsAnalytics Pro - Aplikasi Gaul dan Kece
class SportsAnalyticsApp {
    constructor() {
        this.apiUrl = 'http://localhost:3001/api';
        this.socket = null;
        this.token = localStorage.getItem('token');
        this.user = null;
        this.currentView = 'dashboard';
        this.charts = {};

        this.init();
    }

    init() {
        this.setupEventListeners();

        if (this.token) {
            this.validateToken();
        } else {
            this.showAuthModal();
        }

        // Sembunyiin loading screen
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
        }, 1000);
    }

    setupEventListeners() {
        // Auth tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchAuthTab(e.target.dataset.tab));
        });

        // Forms
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e.target.dataset.view));
        });

        // User menu
        document.getElementById('user-menu-btn').addEventListener('click', () => {
            document.getElementById('user-dropdown').classList.toggle('hidden');
        });

        // Logout
        document.querySelector('[data-action="logout"]').addEventListener('click', (e) => {
            e.preventDefault();
            this.logout();
        });

        // Close modals
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });

        // Create portfolio
        document.getElementById('create-portfolio-btn')?.addEventListener('click', () => {
            this.showCreatePortfolioModal();
        });

        // Position form
        document.getElementById('position-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.openPosition();
        });

        // Position type selector
        document.querySelectorAll('.pos-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.pos-type-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        // Confidence slider
        document.querySelector('input[name="confidence"]')?.addEventListener('input', (e) => {
            document.querySelector('.confidence-value').textContent = e.target.value + '%';
        });

        // Time filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.loadDashboardData(e.target.dataset.period);
            });
        });

        // Market search
        document.getElementById('market-search')?.addEventListener('input', (e) => {
            this.searchEntities(e.target.value);
        });

        // Category filters
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.loadMarketData(e.target.dataset.sport);
            });
        });
    }

    // Authentication - cek token valid gak
    async validateToken() {
        try {
            const response = await fetch(`${this.apiUrl}/auth/verify`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.showMainApp();
                this.connectWebSocket();
            } else {
                this.showAuthModal();
            }
        } catch (error) {
            console.error('Error validasi token:', error);
            this.showAuthModal();
        }
    }

    // Login handler
    async handleLogin(e) {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
            const response = await fetch(`${this.apiUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: formData.get('username'),
                    password: formData.get('password')
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                this.showToast('Login sukses bos! Selamat datang kembali 🔥', 'success');
                this.showMainApp();
                this.connectWebSocket();
            } else {
                this.showToast(data.error || 'Login gagal nih bos', 'error');
            }
        } catch (error) {
            this.showToast('Error jaringan, cek koneksi lu ya', 'error');
        }
    }

    // Register handler
    async handleRegister(e) {
        e.preventDefault();
        const formData = new FormData(e.target);

        try {
            const response = await fetch(`${this.apiUrl}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: formData.get('username'),
                    email: formData.get('email'),
                    password: formData.get('password'),
                    firstName: formData.get('firstName'),
                    lastName: formData.get('lastName'),
                    country: formData.get('country')
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                this.showToast('Akun berhasil dibikin! Modal $10.000 udah masuk bos 🎉', 'success');
                this.showMainApp();
                this.connectWebSocket();
            } else {
                this.showToast(data.error || 'Registrasi gagal nih bos', 'error');
            }
        } catch (error) {
            this.showToast('Error jaringan, cek koneksi lu ya', 'error');
        }
    }

    // Logout - keluar dari akun
    logout() {
        localStorage.removeItem('token');
        this.token = null;
        this.user = null;
        if (this.socket) {
            this.socket.disconnect();
        }
        this.showToast('Logout sukses! Sampai jumpa lagi bos 👋', 'info');
        setTimeout(() => location.reload(), 1000);
    }

    // WebSocket Connection - koneksi real-time
    connectWebSocket() {
        this.socket = io('http://localhost:3001', {
            auth: { token: this.token }
        });

        this.socket.on('connect', () => {
            console.log('🔌 Nyambung ke server real-time');
            this.showToast('Terhubung ke pasar live! 🚀', 'success');
            this.socket.emit('subscribe:market');
        });

        this.socket.on('market:tick', (data) => {
            this.updateLiveTicker(data);
        });

        this.socket.on('entity:update', (data) => {
            this.updateEntityCard(data);
        });

        this.socket.on('position:opened', (data) => {
            this.showToast('Posisi berhasil dibuka bos! Gaskeun cuan! 📈', 'success');
            this.loadPortfolioData();
        });

        this.socket.on('position:closed', (data) => {
            const pnl = data.pnl;
            const message = pnl >= 0 
                ? `Posisi ditutup! Cuan $${pnl.toFixed(2)} 🎉` 
                : `Posisi ditutup. Rugi $${Math.abs(pnl).toFixed(2)} 😢`;
            this.showToast(message, pnl >= 0 ? 'success' : 'info');
            this.loadPortfolioData();
        });

        this.socket.on('leaderboard:update', (data) => {
            this.updateLeaderboard(data);
        });

        this.socket.on('portfolio:update', (data) => {
            this.updatePortfolioDisplay(data);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Error WebSocket:', error);
            this.showToast('Koneksi real-time putus, coba refresh ya bos', 'error');
        });
    }

    // UI Management - atur tampilan
    switchAuthTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));

        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`${tab}-panel`).classList.add('active');
    }

    showAuthModal() {
        document.getElementById('auth-modal').classList.add('active');
        document.getElementById('main-app').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('auth-modal').classList.remove('active');
        document.getElementById('main-app').classList.remove('hidden');

        // Update tampilan user
        document.getElementById('username-display').textContent = this.user.username;
        document.getElementById('user-balance').textContent = 
            '$' + parseFloat(this.user.virtualBalance).toLocaleString('en-US', {minimumFractionDigits: 2});

        // Load data awal
        this.loadDashboardData('24h');
        this.loadMarketData('all');
        this.loadPortfolioData();
    }

    switchView(viewName) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

        document.getElementById(`${viewName}-view`).classList.add('active');
        document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

        this.currentView = viewName;

        if (viewName === 'analytics') {
            this.loadAnalyticsData();
        }
    }

    // Data Loading - ambil data dari server
    async loadDashboardData(period = '24h') {
        try {
            const response = await fetch(`${this.apiUrl}/analytics/dashboard`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.updateDashboard(data);
            }
        } catch (error) {
            console.error('Error load dashboard:', error);
        }
    }

    async loadMarketData(sport = 'all') {
        try {
            const response = await fetch(`${this.apiUrl}/market/overview`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderMarketData(data, sport);
            }
        } catch (error) {
            console.error('Error load market:', error);
        }
    }

    async loadPortfolioData() {
        try {
            const response = await fetch(`${this.apiUrl}/portfolio`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderPortfolios(data.portfolios);
            }
        } catch (error) {
            console.error('Error load portfolio:', error);
        }
    }

    async loadAnalyticsData() {
        try {
            const response = await fetch(`${this.apiUrl}/analytics/performance`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderAnalytics(data);
            }
        } catch (error) {
            console.error('Error load analytics:', error);
        }
    }

    // Rendering - tampilin data ke UI
    updateDashboard(data) {
        if (data.summary) {
            const totalValue = parseFloat(data.summary.total_current_value || 0);
            const totalInvested = parseFloat(data.summary.total_invested || 0);
            const pnl = totalValue - totalInvested;
            const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

            document.getElementById('total-value').textContent = '$' + totalValue.toLocaleString('en-US', {minimumFractionDigits: 2});
            document.getElementById('active-positions').textContent = data.summary.total_positions || 0;
            document.getElementById('win-rate').textContent = (data.summary.win_rate || 0) + '%';
            document.getElementById('avg-confidence').textContent = (data.summary.avg_confidence || 0).toFixed(1);

            // Update saldo display
            document.getElementById('user-balance').textContent = '$' + (this.user.virtualBalance + totalValue).toLocaleString('en-US', {minimumFractionDigits: 2});
        }

        if (data.recentActivity) {
            this.renderMarketMovers(data.recentActivity);
        }

        if (data.topPositions) {
            this.renderTopPerformers(data.topPositions);
        }
    }

    renderMarketMovers(activities) {
        const container = document.getElementById('market-movers');
        if (!container) return;

        container.innerHTML = activities.slice(0, 5).map(activity => `
            <div class="mover-item">
                <div class="mover-info">
                    <div class="mover-icon">${this.getSportIcon(activity.sport)}</div>
                    <div class="mover-details">
                        <h4>${activity.entity_name || 'Gak tau nih'}</h4>
                        <span>${activity.sport || 'Umum'}</span>
                    </div>
                </div>
                <div class="mover-change">
                    <div class="value ${activity.change >= 0 ? 'positive' : 'negative'}">
                        ${activity.change >= 0 ? '+' : ''}${(activity.change || 0).toFixed(2)}%
                    </div>
                    <div class="label">Vol: ${(activity.volume || 0).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    }

    renderTopPerformers(performers) {
        const container = document.getElementById('top-performers');
        if (!container) return;

        container.innerHTML = performers.slice(0, 5).map((performer, index) => `
            <div class="performer-item">
                <div class="performer-rank ${index < 3 ? 'top' : ''}">${index + 1}</div>
                <div class="performer-info">
                    <h4>${performer.entity_name}</h4>
                    <span>${performer.sport_name}</span>
                </div>
                <div class="performer-return">+${(performer.return_pct || 0).toFixed(2)}%</div>
            </div>
        `).join('');
    }

    renderMarketData(data, sportFilter) {
        let entities = data.trending || [];
        if (sportFilter !== 'all') {
            entities = entities.filter(e => e.sport_slug === sportFilter);
        }

        const trendingContainer = document.getElementById('trending-entities');
        if (trendingContainer) {
            trendingContainer.innerHTML = entities.slice(0, 8).map(entity => `
                <div class="entity-card" data-entity-id="${entity.id}">
                    <div class="entity-header">
                        <div class="entity-icon">${this.getSportIcon(entity.sport_name)}</div>
                        <div class="entity-title">
                            <h4>${entity.name}</h4>
                            <span>${entity.sport_name}</span>
                        </div>
                    </div>
                    <div class="entity-metrics">
                        <div class="metric">
                            <div class="metric-label">Rating Form</div>
                            <div class="metric-value">${(entity.current_form_rating || 5).toFixed(1)}/10</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Volatilitas</div>
                            <div class="metric-value">${(entity.volatility_index || 10).toFixed(1)}%</div>
                        </div>
                    </div>
                    <div class="entity-actions">
                        <button class="btn btn-primary" onclick="app.showPositionModal('${entity.id}')">Analisa</button>
                        <button class="btn btn-text" onclick="app.viewEntityDetails('${entity.id}')">Detail</button>
                    </div>
                </div>
            `).join('');
        }

        const eventsContainer = document.getElementById('live-events');
        if (eventsContainer && data.liveEvents) {
            eventsContainer.innerHTML = data.liveEvents.map(event => `
                <div class="event-card" data-event-id="${event.id}">
                    <div class="event-team">
                        <div class="team-name">${event.home_name}</div>
                        <div class="team-odds">${(event.home_probability || 50).toFixed(0)}%</div>
                    </div>
                    <div class="event-vs">
                        <div class="time">🔴 LIVE</div>
                        <div class="sport">${event.sport_name}</div>
                    </div>
                    <div class="event-team">
                        <div class="team-name">${event.away_name}</div>
                        <div class="team-odds">${(event.away_probability || 50).toFixed(0)}%</div>
                    </div>
                </div>
            `).join('');
        }
    }

    renderPortfolios(portfolios) {
        const container = document.getElementById('portfolios-list');
        if (!container) return;

        if (portfolios.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Belum ada portfolio nih bos</h3>
                    <p>Bikin portfolio pertama lu yuk, siap-siap cuan! 🚀</p>
                </div>
            `;
            return;
        }

        container.innerHTML = portfolios.map(portfolio => {
            const pnl = parseFloat(portfolio.current_value || 0) - parseFloat(portfolio.total_invested || 0);
            const pnlPct = portfolio.total_invested > 0 ? (pnl / parseFloat(portfolio.total_invested)) * 100 : 0;
            const isPositive = pnl >= 0;

            return `
                <div class="portfolio-card" data-portfolio-id="${portfolio.id}">
                    <div class="portfolio-header">
                        <div class="portfolio-title">
                            <h3>${portfolio.name}</h3>
                            <span>Strategi ${portfolio.strategy_type || 'Seimbang'}</span>
                        </div>
                        <span class="portfolio-badge">${portfolio.risk_profile || 'Seimbang'}</span>
                    </div>
                    <div class="portfolio-stats">
                        <div class="portfolio-stat">
                            <div class="label">Nilai</div>
                            <div class="value">$${(parseFloat(portfolio.current_value || 0)).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
                        </div>
                        <div class="portfolio-stat">
                            <div class="label">P&L</div>
                            <div class="value ${isPositive ? 'positive' : 'negative'}">
                                ${isPositive ? '+' : ''}${pnlPct.toFixed(2)}%
                            </div>
                        </div>
                        <div class="portfolio-stat">
                            <div class="label">Posisi</div>
                            <div class="value">${portfolio.open_positions || 0}</div>
                        </div>
                    </div>
                    <div class="portfolio-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${Math.min(100, Math.max(0, 50 + (pnlPct / 2)))}%"></div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-full" onclick="app.viewPortfolio('${portfolio.id}')">
                        Lihat Detail
                    </button>
                </div>
            `;
        }).join('');
    }

    renderAnalytics(data) {
        const pnlCtx = document.getElementById('pnl-chart');
        if (pnlCtx && data.monthlyTrend) {
            if (this.charts.pnl) this.charts.pnl.destroy();

            this.charts.pnl = new Chart(pnlCtx, {
                type: 'line',
                data: {
                    labels: data.monthlyTrend.map(t => new Date(t.month).toLocaleDateString('id-ID', { month: 'short' })),
                    datasets: [{
                        label: 'Laba/Rugi Bersih',
                        data: data.monthlyTrend.map(t => t.net_pnl),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            grid: { color: 'rgba(75, 85, 99, 0.2)' },
                            ticks: { color: '#9ca3af' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#9ca3af' }
                        }
                    }
                }
            });
        }

        const sportCtx = document.getElementById('sport-distribution');
        if (sportCtx && data.sportBreakdown) {
            if (this.charts.sport) this.charts.sport.destroy();

            this.charts.sport = new Chart(sportCtx, {
                type: 'doughnut',
                data: {
                    labels: data.sportBreakdown.map(s => s.sport),
                    datasets: [{
                        data: data.sportBreakdown.map(s => s.positions),
                        backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#9ca3af' }
                        }
                    }
                }
            });
        }
    }

    // Actions - aksi user
    showPositionModal(entityId) {
        document.getElementById('position-modal').classList.add('active');
        document.getElementById('position-modal').dataset.entityId = entityId;
    }

    async openPosition() {
        const modal = document.getElementById('position-modal');
        const entityId = modal.dataset.entityId;
        const portfolioId = 'default';

        const formData = new FormData(document.getElementById('position-form'));
        const positionType = document.querySelector('.pos-type-btn.active').dataset.type;

        try {
            const response = await fetch(`${this.apiUrl}/portfolio/${portfolioId}/positions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    entityId,
                    positionType,
                    quantity: formData.get('quantity'),
                    confidenceScore: formData.get('confidence')
                })
            });

            if (response.ok) {
                modal.classList.remove('active');
                this.showToast('Posisi berhasil dibuka bos! Gaskeun cuan! 🚀', 'success');
            } else {
                const data = await response.json();
                this.showToast(data.error || 'Gagal buka posisi nih bos', 'error');
            }
        } catch (error) {
            this.showToast('Error jaringan, cek koneksi lu ya', 'error');
        }
    }

    viewEntityDetails(entityId) {
        console.log('Lihat detail entity:', entityId);
    }

    viewPortfolio(portfolioId) {
        console.log('Lihat detail portfolio:', portfolioId);
    }

    showCreatePortfolioModal() {
        const name = prompt('Nama portfolio baru:');
        if (name) {
            this.createPortfolio(name);
        }
    }

    async createPortfolio(name) {
        try {
            const response = await fetch(`${this.apiUrl}/portfolio`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, strategyType: 'balanced', riskProfile: 'balanced' })
            });

            if (response.ok) {
                this.showToast('Portfolio baru berhasil dibikin bos! 🎉', 'success');
                this.loadPortfolioData();
            }
        } catch (error) {
            this.showToast('Gagal bikin portfolio nih bos', 'error');
        }
    }

    // Utilities - fungsi pembantu
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span>${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    getSportIcon(sport) {
        const icons = {
            'Basketball': '🏀',
            'Football': '🏈',
            'Soccer': '⚽',
            'Tennis': '🎾',
            'Baseball': '⚾',
            'Esports': '🎮'
        };
        return icons[sport] || '📊';
    }

    updateLiveTicker(data) {
        // Update ticker
    }

    updateEntityCard(data) {
        const card = document.querySelector(`[data-entity-id="${data.entityId}"]`);
        if (card) {
            // Update card
        }
    }

    updateLeaderboard(data) {
        // Update leaderboard
    }

    updatePortfolioDisplay(data) {
        // Update portfolio
    }

    searchEntities(query) {
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            // Search implementation
        }, 300);
    }
}

// Inisialisasi aplikasi
const app = new SportsAnalyticsApp();
