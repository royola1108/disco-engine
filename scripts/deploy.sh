#!/bin/bash
# Full deployment script for Ubuntu/Debian VPS.
# Run as root or with sudo.
set -e

DOMAIN="${1:-}"
REPO_URL="${REPO_URL:-}"   # e.g. git@github.com:you/disco-engine.git

if [ -z "$DOMAIN" ]; then
    echo "Usage: ./deploy.sh your-domain.com"
    echo "   or: DOMAIN=your-domain.com ./deploy.sh"
    exit 1
fi

echo "=== Disco Engine deployment ==="
echo "Domain: $DOMAIN"
echo ""

# 1. Install Docker if missing
if ! command -v docker &>/dev/null; then
    echo "Installing Docker..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
    echo "Docker installed."
else
    echo "Docker already installed: $(docker --version)"
fi

# 2. Clone repo
APP_DIR="/opt/disco-engine"
if [ -d "$APP_DIR" ]; then
    echo "Updating existing repo at $APP_DIR ..."
    cd "$APP_DIR"
    git pull --ff-only
else
    if [ -z "$REPO_URL" ]; then
        echo "REPO_URL not set. Clone your repo manually to $APP_DIR then re-run."
        echo "  export REPO_URL=git@github.com:you/disco-engine.git"
        echo "  ./deploy.sh $DOMAIN"
        exit 1
    fi
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 3. Configure domain
export DOMAIN
# Caddyfile uses {$DOMAIN} — write it to .env so docker compose picks it up
echo "DOMAIN=$DOMAIN" > .env

# 4. Download disco.db
echo "Fetching disco.db ..."
bash scripts/fetch-db.sh

# 5. Build and start
echo "Building and starting containers ..."
docker compose up -d --build

# 6. Wait and check
echo "Waiting for services to start ..."
sleep 5

if curl -sf "https://$DOMAIN/" >/dev/null 2>&1; then
    echo ""
    echo "=== Deployment successful! ==="
    echo "  Observer page: https://$DOMAIN/"
    echo "  MCP endpoint:  https://$DOMAIN/mcp"
    echo ""
    echo "  AI host config:"
    echo '  { "mcpServers": { "disco": { "url": "https://'"$DOMAIN"'/mcp" } } }'
else
    echo ""
    echo "Services started but HTTPS not ready yet."
    echo "Caddy may need a minute to obtain certificates."
    echo "Check: docker compose logs caddy"
    echo ""
    echo "  Observer page (HTTP): http://localhost:3000/"
    echo "  MCP endpoint (HTTP):  http://localhost:3000/mcp"
fi

echo ""
echo "Logs:       docker compose logs -f"
echo "Stop:       docker compose down"
echo "Restart:    docker compose restart"
