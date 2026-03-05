#!/bin/bash

# ============================================
# VLINKED API - DEPLOY SCRIPT (STAGING)
# ============================================

set -e

echo "🚀 Iniciando deploy para staging..."

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se .env.staging existe
if [ ! -f .env.staging ]; then
    echo -e "${RED}❌ Arquivo .env.staging não encontrado!${NC}"
    echo "Copie .env.staging.example para .env.staging e configure as variáveis"
    exit 1
fi

# Carregar variáveis de ambiente
export $(grep -v '^#' .env.staging | xargs)

echo -e "${YELLOW}📦 Building images...${NC}"
docker-compose -f docker-compose.staging.yml build

echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
docker-compose -f docker-compose.staging.yml run --rm api npx prisma migrate deploy

echo -e "${YELLOW}🚀 Starting services...${NC}"
docker-compose -f docker-compose.staging.yml up -d

echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 10

# Verificar saúde da API
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API está saudável!${NC}"
else
    echo -e "${RED}❌ API não respondeu corretamente${NC}"
    docker-compose -f docker-compose.staging.yml logs api --tail=50
    exit 1
fi

echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo ""
echo "📊 Status dos serviços:"
docker-compose -f docker-compose.staging.yml ps

echo ""
echo "📝 Logs:"
echo "  API: docker-compose -f docker-compose.staging.yml logs -f api"
echo "  Worker: docker-compose -f docker-compose.staging.yml logs -f video-worker"
echo "  AI Worker: docker-compose -f docker-compose.staging.yml logs -f ai-worker"
