#!/bin/bash

# VLinked Web Frontend Deploy Script

set -e

echo "🚀 Deploying VLinked Web Frontend..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo -e "${RED}❌ flyctl not found. Installing...${NC}"
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
fi

# Check if logged in to Fly.io
if ! flyctl auth whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Please login to Fly.io${NC}"
    flyctl auth login
fi

# Check if app exists
if ! flyctl apps list | grep -q "vlinked-web-staging"; then
    echo -e "${YELLOW}📦 Creating Fly.io app...${NC}"
    flyctl apps create vlinked-web-staging
fi

# Deploy
echo -e "${GREEN}📤 Deploying to Fly.io...${NC}"
flyctl deploy --app vlinked-web-staging

echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
echo -e "${GREEN}🌐 URL: https://vlinked-web-staging.fly.dev${NC}"
