#!/bin/bash

# VLinked Development Environment Startup Script
# Usage: ./scripts/dev-up.sh

set -e

echo "🚀 Starting VLinked development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose is not installed.${NC}"
    exit 1
fi

# Create necessary directories
echo -e "${BLUE}📁 Creating necessary directories...${NC}"
mkdir -p postgres_data redis_data minio_data

# Start infrastructure services first
echo -e "${BLUE}🐳 Starting infrastructure services (PostgreSQL, Redis, MinIO)...${NC}"
docker-compose up -d postgres redis minio

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 5

# Check PostgreSQL
until docker-compose exec -T postgres pg_isready -U vlinked > /dev/null 2>&1; do
    echo -e "${YELLOW}⏳ Waiting for PostgreSQL...${NC}"
    sleep 2
done
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Check Redis
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    echo -e "${YELLOW}⏳ Waiting for Redis...${NC}"
    sleep 2
done
echo -e "${GREEN}✅ Redis is ready${NC}"

# Check MinIO
until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do
    echo -e "${YELLOW}⏳ Waiting for MinIO...${NC}"
    sleep 2
done
echo -e "${GREEN}✅ MinIO is ready${NC}"

# Install API dependencies if needed
if [ ! -d "apps/api/node_modules" ]; then
    echo -e "${BLUE}📦 Installing API dependencies...${NC}"
    cd apps/api && npm install && cd ../..
fi

# Generate Prisma client
echo -e "${BLUE}🔧 Generating Prisma client...${NC}"
cd apps/api && npx prisma generate && cd ../..

# Run migrations
echo -e "${BLUE}🗄️ Running database migrations...${NC}"
cd apps/api && npx prisma migrate dev --name init && cd ../..

# Seed database
echo -e "${BLUE}🌱 Seeding database...${NC}"
cd apps/api && npx prisma db seed && cd ../..

# Start API server in background
echo -e "${BLUE}▶️ Starting API server...${NC}"
cd apps/api && npm run dev &
API_PID=$!
cd ../..

# Install Web dependencies if needed
if [ ! -d "web/node_modules" ]; then
    echo -e "${BLUE}📦 Installing Web dependencies...${NC}"
    cd web && npm install && cd ..
fi

# Start Web frontend
echo -e "${BLUE}▶️ Starting Web frontend...${NC}"
cd web && npm run dev &
WEB_PID=$!
cd ..

echo ""
echo -e "${GREEN}✅ VLinked development environment is running!${NC}"
echo ""
echo -e "${BLUE}📍 Services:${NC}"
echo -e "  • Web App:      http://localhost:3000"
echo -e "  • API:          http://localhost:3001"
echo -e "  • MinIO:        http://localhost:9001 (minioadmin/minioadmin)"
echo -e "  • PostgreSQL:   localhost:5432"
echo -e "  • Redis:        localhost:6379"
echo ""
echo -e "${YELLOW}⚠️ Press Ctrl+C to stop all services${NC}"
echo ""

# Handle cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping services...${NC}"
    kill $API_PID 2>/dev/null || true
    kill $WEB_PID 2>/dev/null || true
    docker-compose down
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

trap cleanup INT TERM

# Wait for processes
wait
