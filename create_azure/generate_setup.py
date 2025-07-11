def generate_setup(
    DOMAIN_NAME,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PORT
):
    # ========== CONFIGURABLE URLs ==========
    forgejo_git = "https://github.com/SongDrop/gpt.git"
    docker_compose_url = "https://github.com/docker/compose/releases/download/v2.38.1/docker-compose-linux-x86_64"
    buildx_url = "https://github.com/docker/buildx/releases/download/v0.11.2/buildx-v0.11.2.linux-amd64"
    letsencrypt_options_url = "https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf"
    ssl_dhparams_url = "https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem"
    # =======================================
    
    forgejo_dir = "/opt/forgejo"

    script_template = f"""#!/bin/bash

set -e

# Validate domain
if ! [[ "{DOMAIN_NAME}" =~ ^[a-zA-Z0-9.-]+\\.[a-zA-Z]{{2,}}$ ]]; then
    echo "ERROR: Invalid domain format"
    exit 1
fi

# Configuration
DOMAIN_NAME="{DOMAIN_NAME}"
ADMIN_EMAIL="{ADMIN_EMAIL}"
ADMIN_PASSWORD="{ADMIN_PASSWORD}"
PORT="{PORT}"
FORGEJO_DIR="{forgejo_dir}"
DNS_HOOK_SCRIPT="{DNS_HOOK_SCRIPT}"

# ========== SYSTEM SETUP ==========
echo "[1/9] System updates and dependencies..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \\
    curl git docker.io nginx certbot \\
    python3-pip python3-venv jq make net-tools \\
    python3-certbot-nginx \\
    git git-lfs


# ========== DOCKER SETUP ==========
echo "[2/9] Configuring Docker..."
# Install Docker Compose
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "{docker_compose_url}" -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose

# Add user to docker group
usermod -aG docker $USER || true
systemctl enable --now docker
until docker info >/dev/null 2>&1; do sleep 2; done

# ========== FORGEJO SETUP ==========
echo "[3/9] Setting up Forgejo..."
mkdir -p "$FORGEJO_DIR"/{{data,config,ssl}}
cd "$FORGEJO_DIR"

# Handle existing directory scenarios
if [ -d ".git" ]; then
    echo "Existing git repository found, pulling latest changes..."
    git pull
elif [ -z "$(ls -A .)" ]; then
    echo "Cloning fresh Forgejo repository..."
    git clone "{forgejo_git}" .
else
    echo "Directory not empty and not a git repo. Moving contents to backup..."
    mkdir -p ../forgejo_backup
    mv * ../forgejo_backup/ || true
    git clone "{forgejo_git}" .
fi

# ========== BUILD CONTAINER ==========
echo "[4/9] Building Forgejo container..."
# Install buildx plugin if not exists
if ! docker buildx version &>/dev/null; then
    mkdir -p ~/.docker/cli-plugins
    curl -SL "{buildx_url}" -o ~/.docker/cli-plugins/docker-buildx
    chmod +x ~/.docker/cli-plugins/docker-buildx
fi

docker buildx create --use --name forgejo-builder || true
docker buildx inspect --bootstrap
docker buildx build --platform linux/amd64 -t forgejo --load .

# ========== DOCKER COMPOSE ==========
echo "[5/9] Configuring Docker Compose..."
cat > docker-compose.yml <<EOF
version: "3.8"

services:
  server:
    image: forgejo
    container_name: forgejo
    restart: unless-stopped
    environment:
      - FORGEJO__server__DOMAIN={DOMAIN_NAME}
      - FORGEJO__server__ROOT_URL=https://{DOMAIN_NAME}
      - FORGEJO__server__HTTP_PORT=3000
    volumes:
      - ./data:/data
      - ./config:/etc/gitea
      - ./ssl:/ssl
    ports:
      - "{PORT}:3000"
      - "222:22"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 3
EOF

docker compose up -d --wait

# ========== NETWORK SECURITY ==========
echo "[6/9] Configuring firewall..."
ufw allow 22,80,443,{PORT}/tcp
ufw --force enable

# ========== SSL CERTIFICATE ==========
echo "[7/9] Setting up SSL certificate..."

# Download Let's Encrypt configuration files
mkdir -p /etc/letsencrypt
curl -s "{letsencrypt_options_url}" > /etc/letsencrypt/options-ssl-nginx.conf
curl -s "{ssl_dhparams_url}" > /etc/letsencrypt/ssl-dhparams.pem

if [ -f "$DNS_HOOK_SCRIPT" ]; then
    echo "Using DNS hook script at $DNS_HOOK_SCRIPT"
    chmod +x "$DNS_HOOK_SCRIPT"
    
    # Obtain certificate
    certbot certonly --manual \\
        --preferred-challenges=dns \\
        --manual-auth-hook "$DNS_HOOK_SCRIPT add" \\
        --manual-cleanup-hook "$DNS_HOOK_SCRIPT clean" \\
        --agree-tos --email "{ADMIN_EMAIL}" \\
        -d "{DOMAIN_NAME}" -d "*.{DOMAIN_NAME}" \\
        --non-interactive \\
        --manual-public-ip-logging-ok
else
    echo "Warning: No DNS hook script found at $DNS_HOOK_SCRIPT"
    echo "Falling back to standard certificate"
    certbot --nginx -d "{DOMAIN_NAME}" --non-interactive --agree-tos --email "{ADMIN_EMAIL}" --redirect
fi

# ========== NGINX CONFIG ==========
echo "[8/9] Configuring Nginx..."

# Remove default Nginx config
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/forgejo <<EOF
map \$http_upgrade \$connection_upgrade {{
    default upgrade;
    '' close;
}}

server {{
    listen 80;
    server_name {DOMAIN_NAME};
    return 301 https://\$host\$request_uri;
}}

server {{
    listen 443 ssl http2;
    server_name {DOMAIN_NAME};

    ssl_certificate /etc/letsencrypt/live/{DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{DOMAIN_NAME}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {{
        proxy_pass http://localhost:{PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_http_version 1.1;
    }}

    client_max_body_size 1024M;
}}
EOF

ln -sf /etc/nginx/sites-available/forgejo /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

# ========== VERIFICATION ==========
echo "[9/9] Verifying setup..."

# Verify container is running
if ! docker ps | grep -q forgejo; then
    echo "ERROR: Forgejo container is not running!"
    docker logs forgejo
    exit 1
fi

# Verify Nginx config
if ! nginx -t; then
    echo "ERROR: Nginx configuration test failed"
    exit 1
fi

# Verify SSL certificate
if [ ! -f "/etc/letsencrypt/live/{DOMAIN_NAME}/fullchain.pem" ]; then
    echo "ERROR: SSL certificate not found!"
    exit 1
fi

# Verify port accessibility
if ! curl -s -o /dev/null -w "%{{http_code}}" http://localhost:{PORT} | grep -q 200; then
    echo "ERROR: Cannot access Forgejo on port {PORT}"
    exit 1
fi

# ========== FINAL CONFIG ==========
echo "Creating admin user..."
sleep 30  # Increased wait time for Forgejo initialization
docker exec forgejo forgejo admin user create \\
    --username admin \\
    --password "{ADMIN_PASSWORD}" \\
    --email "{ADMIN_EMAIL}" \\
    --admin || echo "Admin user may already exist"

# Complete the installation by accessing the web interface
echo "Waiting for Forgejo to be fully ready..."
until curl -s http://localhost:{PORT} | grep -q "Initial configuration"; do
    sleep 5
done

echo "============================================"
echo "✅ Forgejo Setup Complete!"
echo ""
echo "🔗 Access: https://{DOMAIN_NAME}"
echo "👤 Admin: {ADMIN_EMAIL}"
echo "🔒 Password: {ADMIN_PASSWORD}"
echo ""
echo "⚙️ Verification:"
echo "   - Container status: docker ps"
echo "   - Nginx status: systemctl status nginx"
echo "   - SSL certificate: certbot certificates"
echo "   - Port accessibility: curl -v http://localhost:{PORT}"
echo ""
echo "⚠️ Important:"
echo "1. If you see Nginx default page:"
echo "   sudo rm -f /etc/nginx/sites-enabled/default"
echo "   sudo systemctl restart nginx"
echo "2. If SSL fails:"
echo "   sudo certbot --nginx -d {DOMAIN_NAME} --non-interactive --agree-tos --email {ADMIN_EMAIL} --redirect"
echo "3. First-time setup may require visiting https://{DOMAIN_NAME} to complete installation"
echo "============================================"
"""
    return script_template