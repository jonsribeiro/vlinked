# 🚀 VLinked - Progresso Geral

**Data:** 2026-03-04  
**Versão:** V1.0 Foundation

---

## ✅ Semanas Concluídas

### Semana 1 - Foundation
| Dia | Tarefas | Status |
|-----|---------|--------|
| 1 | Setup, Docker, NestJS, Configs | ✅ |
| 2 | Auth completo + correções de segurança | ✅ |
| 3 | Prisma migrations + Feed architecture | ✅ |

### Semana 2 - Profile + Quota
| Módulo | Status |
|--------|--------|
| Profile (CRUD, contadores) | ✅ |
| Quota (proteção financeira) | ✅ |
| Quota Guard | ✅ |

---

## 📊 Schema Prisma Completo

### Models
| Model | Descrição |
|-------|-----------|
| User | Autenticação (email, password, role, status) |
| Session | Sessões ativas |
| RefreshToken | Tokens de refresh (hash SHA-256) |
| Profile | Perfil público do usuário |
| UserQuota | Proteção financeira |
| AuditLog | Logs de auditoria |
| Video | Metadados de vídeos |
| FeedItem | Feed pré-indexado |

### Enums
| Enum | Valores |
|------|---------|
| UserRole | USER, PREMIUM, ADMIN, MODERATOR |
| UserStatus | ACTIVE, SUSPENDED, BANNED, PENDING_VERIFICATION |
| QuotaTier | FREE, PRO, ENTERPRISE |
| VideoType | VIDEO_CV, WORK_SAMPLE, PORTFOLIO, TIP, BEHIND_SCENES |
| VideoStatus | UPLOADING, PROCESSING, READY, FAILED, HIDDEN |
| Visibility | PUBLIC, UNLISTED, PRIVATE |
| Sentiment | POSITIVE, NEUTRAL, NEGATIVE |

---

## 🔐 Segurança

| Feature | Implementação |
|---------|---------------|
| Password Hashing | bcrypt, 12 rounds |
| Refresh Token Hashing | SHA-256 |
| Token Rotation | ✅ |
| JWT Expiration | 15 minutos |
| Rate Limit - Login | 5/15min |
| Rate Limit - Register | 5/hora |
| Rate Limit - Refresh | 10/min |
| Quota Protection | ✅ (upload, ai, storage) |
| Global Auth Guard | ✅ |

---

## 📡 Endpoints

### Auth
| Método | Endpoint | Auth |
|--------|----------|------|
| POST | /v1/auth/register | Público |
| POST | /v1/auth/login | Público |
| POST | /v1/auth/refresh | Público |
| POST | /v1/auth/logout | Público |

### Profile
| Método | Endpoint | Auth |
|--------|----------|------|
| POST | /v1/profiles | Sim |
| GET | /v1/profiles/me | Sim |
| PATCH | /v1/profiles/me | Sim |
| GET | /v1/profiles/:slug | Público |

### Quota
| Método | Endpoint | Auth |
|--------|----------|------|
| GET | /v1/quota | Sim |
| GET | /v1/quota/check/upload | Sim |
| GET | /v1/quota/check/ai | Sim |

### Feed
| Método | Endpoint | Auth |
|--------|----------|------|
| GET | /v1/feed | Público |
| GET | /v1/feed/personalized | Sim |
| GET | /v1/feed/user/:userId | Público |

### Health
| Método | Endpoint | Auth |
|--------|----------|------|
| GET | /health | Público |

---

## 🏗️ Arquitetura do Feed (Confirmada)

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

### Fatores de Ranking
| Fator | Peso |
|-------|------|
| recency | 30% |
| engagement | 35% |
| quality | 20% |
| profile | 15% |

---

## 📁 Estrutura de Arquivos

```
vlinked/
├── apps/api/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── common/
│   │   │   ├── constants/
│   │   │   ├── decorators/
│   │   │   ├── guards/
│   │   │   └── interceptors/
│   │   ├── config/
│   │   ├── infrastructure/
│   │   │   ├── prisma/
│   │   │   └── redis/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── feed/
│   │   │   ├── health/
│   │   │   ├── profile/
│   │   │   └── quota/
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── .env
│   └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 📝 Documentação

| Arquivo | Descrição |
|---------|-----------|
| `SETUP_PROGRESSO.md` | Progresso do Dia 1 |
| `DIA_2_AUTH_RESUMO.md` | Resumo do Auth |
| `AUTH_CORRECOES.md` | Correções de segurança |
| `DIA_3_MIGRATION.md` | Guia de migrations |
| `ARQUITETURA_FEED.md` | Arquitetura do feed |
| `SEMANA_2_RESUMO.md` | Resumo da Semana 2 |
| `PROGRESSO_GERAL.md` | Este arquivo |

---

## ⏳ Próximas Semanas

### Semana 3 - Studio
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

*Progresso: 2/7 semanas concluídas (29%)*
