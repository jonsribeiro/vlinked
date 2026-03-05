# VLinked API - Deploy Guide

## Novas Melhorias V1.5

### ✅ Testes Automatizados
- **Jest + Supertest** para testes e2e
- Cobertura: Auth, Feed, Interactions
- Execute: `npm run test:e2e`

### ✅ Observabilidade
- **Sentry** para error tracking e performance
- **Pino** para logs estruturados
- Configure `SENTRY_DSN` e `LOG_LEVEL`

### ✅ Verificação de Email
- Token de verificação enviado no registro
- Endpoint `/v1/auth/verify-email`
- Usuários não verificados têm acesso limitado

---

## Staging Deployment

### Prerequisites

- Docker & Docker Compose
- Cloudflare R2 account (or AWS S3)
- OpenAI API key (optional, can use mock)
- Domain configured (api-staging.vlinked.app)
- **Sentry account** (opcional, para error tracking)
- **Resend account** (opcional, para emails em produção)

### Setup

1. **Clone e configure o ambiente:**
```bash
cd apps/api
cp .env.staging.example .env.staging
# Edite .env.staging com suas credenciais
```

2. **Configure as variáveis obrigatórias:**
```bash
# JWT Secret (gerar novo)
openssl rand -base64 32

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
STORAGE_ACCESS_KEY_ID=your-access-key
STORAGE_SECRET_ACCESS_KEY=your-secret-key

# OpenAI (opcional)
OPENAI_API_KEY=your-openai-key
```

3. **Deploy:**
```bash
./deploy-staging.sh
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| API | 3000 | API principal |
| Video Worker | - | Processamento FFmpeg |
| AI Worker | - | Análise Whisper/GPT |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache & Queues |
| Nginx | 80/443 | Reverse Proxy |

### Comandos Úteis

```bash
# Ver logs
docker-compose -f docker-compose.staging.yml logs -f api

# Restart serviço
docker-compose -f docker-compose.staging.yml restart api

# Scale workers
docker-compose -f docker-compose.staging.yml up -d --scale video-worker=3

# Backup database
docker-compose -f docker-compose.staging.yml exec postgres pg_dump -U vlinked vlinked > backup.sql

# Acessar container
docker-compose -f docker-compose.staging.yml exec api sh

# Prisma Studio
docker-compose -f docker-compose.staging.yml exec api npx prisma studio
```

### Health Checks

- API: `GET http://localhost:3000/health`
- Database: `docker-compose exec postgres pg_isready`
- Redis: `docker-compose exec redis redis-cli ping`

### Troubleshooting

**Problema: API não inicia**
```bash
# Verificar logs
docker-compose logs api

# Verificar migrations
docker-compose run --rm api npx prisma migrate status
```

**Problema: Workers não processam**
```bash
# Verificar filas no Redis
docker-compose exec redis redis-cli
> LLEN bull:video-processing:wait
> LLEN bull:ai-analysis:wait
```

**Problema: Upload falha**
- Verificar credenciais R2/S3
- Verificar bucket existe e está acessível

### SSL (Let's Encrypt)

Para produção com SSL válido:

```bash
# Instalar certbot
docker run -it --rm \
  -v "$(pwd)/nginx/ssl:/etc/letsencrypt" \
  -v "$(pwd)/nginx/www:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d api-staging.vlinked.app
```

### Monitoramento

Recomendado configurar:
- **Sentry** para error tracking ✅ (já implementado)
- **Pino** para logs estruturados ✅ (já implementado)
- **Prometheus + Grafana** para métricas
- **UptimeRobot** para health checks externos

### Logs Estruturados (Pino)

```bash
# Ver logs da API
docker-compose -f docker-compose.staging.yml logs -f api

# Logs em formato JSON (produção)
# Logs coloridos e legíveis (desenvolvimento)
```

### Testes

```bash
# Rodar todos os testes
npm run test

# Testes e2e (requer banco de dados de teste)
cp .env.test.example .env.test
# Configure DATABASE_URL para banco de teste
npm run test:e2e

# Cobertura
npm run test:cov
```

### Verificação de Email

Fluxo implementado:
1. Usuário se registra → recebe email com token
2. Usuário clica no link → `/v1/auth/verify-email?token=xxx`
3. Conta ativada → pode usar todas as funcionalidades

**Restrições para usuários não verificados:**
- ❌ Não podem fazer upload de vídeos
- ❌ Não podem comentar
- ✅ Podem visualizar feed
- ✅ Podem curtir vídeos

Para reenviar email de verificação:
```bash
POST /v1/auth/resend-verification
{ "email": "usuario@exemplo.com" }
```

### Escala

Para escalar horizontalmente:

```bash
# Múltiplos workers de vídeo
docker-compose up -d --scale video-worker=5

# Load balancer (usando Docker Swarm ou Kubernetes)
```

## Production Deployment

Para produção, recomendamos:

1. **Kubernetes** (EKS, GKE, ou self-hosted)
2. **Managed Database** (RDS, Cloud SQL)
3. **Managed Redis** (ElastiCache, Memorystore)
4. **CDN** (CloudFront, Cloudflare)
5. **Object Storage** (S3, R2)
6. **CI/CD** (GitHub Actions, GitLab CI)

### Arquitetura Production

```
┌─────────────┐
│   CDN       │
│ (Cloudflare)│
└──────┬──────┘
       │
┌──────▼──────┐
│   Nginx     │
│  (Ingress)  │
└──────┬──────┘
       │
┌──────▼──────┐     ┌─────────────┐
│   API Pods  │────▶│   Redis     │
│  (K8s)      │     │  (Cluster)  │
└──────┬──────┘     └─────────────┘
       │
┌──────▼──────┐     ┌─────────────┐
│  Worker Pods│────▶│  PostgreSQL │
│  (K8s)      │     │   (RDS)     │
└─────────────┘     └─────────────┘
```

### CI/CD Pipeline (GitHub Actions)

```yaml
name: Deploy to Staging

on:
  push:
    branches: [ develop ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/vlinked/apps/api
            git pull origin develop
            ./deploy-staging.sh
```

---

## Frontend Web Deployment

### Estrutura do Frontend

```
apps/web/
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # Componentes React
│   ├── contexts/         # Contextos (Auth)
│   ├── lib/             # Utilitários
│   └── types/           # Tipos TypeScript
├── Dockerfile           # Container Docker
├── fly.toml            # Config Fly.io
└── deploy.sh           # Script de deploy
```

### Deploy no Fly.io

1. **Navegar para o diretório:**
```bash
cd apps/web
```

2. **Configurar variáveis de ambiente:**
```bash
cp .env.example .env.local
# Editar .env.local
```

3. **Deploy:**
```bash
./deploy.sh
# Ou manualmente:
flyctl deploy --app vlinked-web-staging
```

### Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `NEXT_PUBLIC_API_URL` | URL da API | `https://api.vlinked-staging.fly.dev` |

### Build Docker Local

```bash
docker build -t vlinked-web .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=https://api.vlinked-staging.fly.dev vlinked-web
```

### Desenvolvimento Local

```bash
cd apps/web
npm install
npm run dev
# Acesse http://localhost:3000
```

---

## Deploy Completo (API + Frontend)

### Ordem de Deploy

1. **API e Workers primeiro:**
```bash
cd apps/api
./deploy-staging.sh
```

2. **Depois o Frontend:**
```bash
cd apps/web
./deploy.sh
```

### URLs após Deploy

| Serviço | URL Staging |
|---------|-------------|
| API | `https://api.vlinked-staging.fly.dev` |
| Web App | `https://vlinked-web-staging.fly.dev` |

### Health Checks Pós-Deploy

```bash
# Testar API
curl https://api.vlinked-staging.fly.dev/health

# Testar Web
curl https://vlinked-web-staging.fly.dev

# Testar fluxo completo
# 1. Registrar usuário
# 2. Fazer onboarding
# 3. Fazer upload de vídeo
# 4. Ver feed
```
