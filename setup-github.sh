#!/bin/bash
# Script setup GitHub untuk SportsAnalytics Pro
# Repo: https://github.com/agoung/Gambling.git

echo "🚀 Setup GitHub Repository - SportsAnalytics Pro"
echo "================================================"
echo ""

# Cek apakah di dalam folder project
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Lu harus run script ini dari dalam folder fantasy-sports-analytics/"
    echo "   Contoh: cd /path/to/fantasy-sports-analytics && bash setup-github.sh"
    exit 1
fi

# Inisialisasi git
echo "📦 Inisialisasi Git repository..."
git init

# Tambahin semua file
echo "➕ Nambahin semua file ke staging area..."
git add .

# Commit pertama
echo "💾 Commit awal..."
git commit -m "🚀 Initial commit: SportsAnalytics Pro - Platform analitik olahraga kece abis

Features:
- Real-time WebSocket streaming
- Portfolio management dengan P&L tracking
- JWT authentication dengan security ketat
- PostgreSQL + Redis architecture
- Docker Compose ready
- UI dark theme gaul dan kece"

# Tambahin remote repository
echo "🔗 Nambahin remote repository..."
git remote add origin https://github.com/agoung/Gambling.git

# Push ke GitHub
echo "☁️ Push ke GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "✅ Berhasil! Cek repo lu di: https://github.com/agoung/Gambling"
echo ""
echo "🔥 SportsAnalytics Pro udah live di GitHub bos!"
