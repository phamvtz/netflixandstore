#!/bin/bash
# ============================================================
# Netflix Store — Quick Deploy Script
# Chạy trên Ubuntu VPS mới: bash deploy.sh
# ============================================================

set -e
echo "🚀 Netflix Store Deploy Script"
echo "================================"

# 1. Cài Node.js 20
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git > /dev/null 2>&1
sudo npm install -g pm2 > /dev/null 2>&1
echo "✅ Node.js $(node -v) installed"

# 2. Clone repo
echo "📥 Cloning repo..."
cd /var/www
# ⚠️ Thay YOUR_GITHUB_REPO bằng URL repo của bạn
git clone YOUR_GITHUB_REPO netflix
cd netflix

# 3. Tạo .env
echo "⚙️  Creating .env..."
cat > .env << 'ENVEOF'
# ⚠️ PASTE NỘI DUNG .env CỦA BẠN VÀO ĐÂY
ENVEOF
echo "✅ .env created (nhớ điền đủ thông tin!)"

# 4. Install + Build
echo "🔨 Installing dependencies..."
npm install > /dev/null 2>&1
echo "🏗️  Building frontend..."
npm run build > /dev/null 2>&1
echo "✅ Build complete"

# 5. Start với PM2
echo "🟢 Starting server..."
pm2 start server.cjs --name netflix-store
pm2 save
pm2 startup | tail -1 | bash > /dev/null 2>&1
echo "✅ Server running with PM2"

# 6. Nginx
echo "🌐 Configuring Nginx..."
sudo cp nginx.conf.example /etc/nginx/sites-available/netflix
sudo ln -sf /etc/nginx/sites-available/netflix /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
echo "✅ Nginx configured"

echo ""
echo "============================================"
echo "✅ DEPLOY HOÀN TẤT!"
echo "Còn cần làm:"
echo "  1. Sửa domain trong /etc/nginx/sites-available/netflix"
echo "  2. Chạy: sudo certbot --nginx -d yourdomain.com"
echo "  3. Trỏ DNS A record về IP server này"
echo "  4. Kiểm tra: pm2 logs netflix-store"
echo "============================================"
