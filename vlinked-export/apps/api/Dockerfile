# ============================================
# VLINKED API - DOCKERFILE
# ============================================

FROM node:20-alpine AS builder

# Instalar dependências de build
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências
RUN npm ci

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código fonte
COPY . .

# Build
RUN npm run build

# ============================================
# PRODUCTION STAGE
# ============================================
FROM node:20-alpine AS production

# Instalar FFmpeg para processamento de vídeo
RUN apk add --no-cache ffmpeg curl

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY prisma ./prisma/

# Instalar apenas dependências de produção
RUN npm ci --only=production

# Gerar Prisma Client
RUN npx prisma generate

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist

# Criar diretório para uploads temporários
RUN mkdir -p /tmp/vlinked

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Comando de inicialização
CMD ["node", "dist/main.js"]
