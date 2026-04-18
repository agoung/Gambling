# 🚀 SportsAnalytics Pro

> Platform analitik olahraga real-time yang kece abis! Built with gambling-site architecture tapi 100% legal buat analisis olahraga.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

## ✨ Fitur Gokil

- ⚡ **Real-time Streaming** - Data pasar update tiap 5 detik via WebSocket
- 📊 **Portfolio Management** - Tracking P&L kayak trading app
- 🔐 **Security Ketat** - JWT, rate limiting, password hashing
- 🎨 **UI Kece** - Dark theme dengan neon accents
- 🐳 **Docker Ready** - Tinggal `docker-compose up` langsung jalan
- 💰 **Virtual Currency** - Modal awal $10.000 buat latihan analisa

## 🎯 Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Backend | Node.js + Express |
| Real-time | Socket.io + Redis |
| Database | PostgreSQL |
| Cache | Redis |
| Frontend | Vanilla JS + Chart.js |
| Proxy | Nginx |
| Deploy | Docker Compose |

## 🚀 Quick Start

```bash
# Clone repo
git clone https://github.com/agoung/Gambling.git
cd Gambling

# Setup environment
cp .env.example .env
# Edit .env sesuai kebutuhan lu

# Jalankan dengan Docker
docker-compose up -d

# Buka browser
open http://localhost
```

## 🔑 Demo Account

- **Username:** `demo_user`
- **Password:** `TestPassword123!`

## 📁 Struktur Folder

```
Gambling/
├── 📁 backend/          # API server
│   ├── 📄 server.js     # Entry point
│   ├── 📁 routes/       # API routes
│   └── 📁 middleware/   # Auth & security
├── 📁 frontend/         # UI
│   ├── 📄 index.html    # Main page
│   ├── 📁 css/          # Styling
│   └── 📁 js/           # Logic
├── 📁 database/         # SQL files
├── 📁 nginx/            # Reverse proxy
├── 📁 websocket/        # Real-time service
└── 📄 docker-compose.yml
```

## 🛡️ Security Features

- ✅ Rate limiting (5x login per 15 menit)
- ✅ Password complexity requirements
- ✅ JWT dengan refresh tokens
- ✅ Token blacklisting
- ✅ Input validation
- ✅ SQL injection protection
- ✅ CORS configuration
- ✅ Helmet.js security headers

## 🎨 UI Preview

Dashboard dengan:
- Live ticker pasar
- Real-time charts
- Portfolio cards
- Market movers
- Performance analytics

## 🤝 Kontribusi

Mau kontribusi? Gaskeun!

1. Fork repo ini
2. Bikin branch baru (`git checkout -b fitur-keren-lu`)
3. Commit perubahan (`git commit -m 'Nambah fitur gokil'`)
4. Push ke branch (`git push origin fitur-keren-lu`)
5. Bikin Pull Request

## 📝 Catatan

> ⚠️ **Disclaimer:** Ini aplikasi analitik olahraga untuk edukasi. Gak ada judi beneran, semua pake virtual currency. Dibuat dengan arsitektur mirip situs judi buat demonstrasi teknologi enterprise.

## 📞 Kontak

Ada pertanyaan? Bikin issue aja di tab Issues.

---

Dibuat dengan ❤️ dan ☕ oleh tim SportsAnalytics Pro
