# 📊 Semana 2 - Profile Module + Quota Module

## ✅ Concluído

### Schema Prisma Atualizado
| Model | Descrição |
|-------|-----------|
| User | Relações com Profile e UserQuota |
| Profile | Perfil público do usuário |
| UserQuota | Proteção financeira (quotas) |

### Profile Module
| Arquivo | Descrição |
|---------|-----------|
| `profile.service.ts` | CRUD de perfis, contadores |
| `profile.controller.ts` | Endpoints: POST, GET, PATCH |
| `create-profile.dto.ts` | Validação de criação |
| `update-profile.dto.ts` | Validação de atualização |
| `profile.module.ts` | Módulo NestJS |

### Quota Module
| Arquivo | Descrição |
|---------|-----------|
| `quota.service.ts` | Verificação e gerenciamento de quotas |
| `quota.controller.ts` | Endpoints de verificação |
| `quota.module.ts` | Módulo NestJS |
| `quota.guard.ts` | Guard para proteção de rotas |
| `require-quota.decorator.ts` | @RequireQuota() decorator |

### Tiers de Quota
| Tier | Uploads | Duração | Storage | IA |
|------|---------|---------|---------|-----|
| FREE | 5/mês | 3 min | 1 GB | 3/mês |
| PRO | Ilimitado | 10 min | 50 GB | 50/mês |
| ENTERPRISE | Ilimitado | 30 min | 500 GB | 500/mês |

### Endpoints de Profile
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /v1/profiles | Criar perfil |
| GET | /v1/profiles/me | Meu perfil |
| PATCH | /v1/profiles/me | Atualizar perfil |
| GET | /v1/profiles/:slug | Perfil por slug (público) |

### Endpoints de Quota
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | /v1/quota | Minha quota |
| GET | /v1/quota/check/upload | Verificar upload |
| GET | /v1/quota/check/ai | Verificar IA |

### Uso do Guard de Quota
```typescript
@Post('upload')
@RequireQuota('upload')
async uploadVideo() {
  // Só executa se tiver quota disponível
}

@Post('analyze')
@RequireQuota('ai')
async analyzeVideo() {
  // Só executa se tiver quota de IA disponível
}
```

---

## 🏗️ Arquitetura do Feed Confirmada

### Event Flow
```
VideoUploaded
    ↓
VideoTranscoded (FFmpeg)
    ↓
VideoAnalyzed (Whisper + GPT)
    ↓
VideoAnalyzed Event → FeedIndexer
    ↓
FeedItem created (score pré-calculado)
    ↓
GET /feed consulta feed_items ordenado por score
```

### FeedItem Schema
```prisma
model FeedItem {
  id          String
  videoId     String
  score       Float        // Pré-calculado
  factors     Json         // { recency, engagement, quality, profile }
  impressions Int
  clicks      Int
  targetAudience Json?
  expiresAt   DateTime?
  
  @@index([score, createdAt])  // Índice crítico
}
```

### NUNCA calcula score em tempo real
```sql
SELECT * FROM feed_items
ORDER BY score DESC, createdAt DESC
LIMIT 20
```

---

## 📁 Estrutura Final

```
apps/api/src/
├── common/
│   ├── constants/events.constants.ts
│   ├── decorators/
│   │   ├── public.decorator.ts
│   │   ├── roles.decorator.ts
│   │   ├── current-user.decorator.ts
│   │   ├── rate-limit.decorator.ts
│   │   └── require-quota.decorator.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   ├── rate-limit.guard.ts
│   │   └── quota.guard.ts
│   └── interceptors/
│       ├── correlation-id.interceptor.ts
│       └── logging.interceptor.ts
├── config/
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── jwt.config.ts
│   └── redis.config.ts
├── infrastructure/
│   ├── prisma/
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   └── redis/
│       ├── redis.service.ts
│       └── redis.module.ts
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   └── strategies/
│   ├── feed/
│   │   ├── feed.controller.ts
│   │   ├── feed.module.ts
│   │   ├── feed.service.ts
│   │   ├── feed-indexer.service.ts
│   │   └── handlers/
│   │       └── video-analyzed.handler.ts
│   ├── health/
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   ├── profile/
│   │   ├── profile.controller.ts
│   │   ├── profile.module.ts
│   │   ├── profile.service.ts
│   │   └── dto/
│   └── quota/
│       ├── quota.controller.ts
│       ├── quota.module.ts
│       └── quota.service.ts
├── app.module.ts
└── main.ts
```

---

## 🔐 Segurança Implementada

| Feature | Implementação |
|---------|---------------|
| Password Hashing | bcrypt, 12 rounds |
| Refresh Token Hashing | SHA-256 |
| Token Rotation | ✅ |
| JWT Expiration | 15 minutos |
| Rate Limit | ✅ (login, register, refresh) |
| Quota Protection | ✅ (upload, ai, storage) |
| Global Auth Guard | ✅ |

---

## 📡 Endpoints Disponíveis

### Auth
- POST /v1/auth/register
- POST /v1/auth/login
- POST /v1/auth/refresh
- POST /v1/auth/logout

### Profile
- POST /v1/profiles
- GET /v1/profiles/me
- PATCH /v1/profiles/me
- GET /v1/profiles/:slug

### Quota
- GET /v1/quota
- GET /v1/quota/check/upload
- GET /v1/quota/check/ai

### Feed
- GET /v1/feed
- GET /v1/feed/personalized
- GET /v1/feed/user/:userId

### Health
- GET /health

---

## ⏳ Próximas Semanas

### Semana 3 - Studio (Upload + Transcode)
- Presigned URLs (R2)
- FFmpeg transcode
- Thumbnails
- HLS streaming

### Semana 4 - AI Director
- Whisper (transcrição)
- GPT (análise)
- Cache de análises

### Semana 5 - Feed + Social
- Feed indexer
- Follow/unfollow
- Like/comment

---

*Semana 2 - Profile + Quota - COMPLETA*
