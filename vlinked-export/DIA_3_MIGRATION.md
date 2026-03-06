# ✅ DIA 3 - Prisma Migrations + Database Models

## 📋 Checklist

### 1. Iniciar Containers
```bash
cd /mnt/okcomputer/output/vlinked
docker-compose up -d
```

Verificar se estão rodando:
```bash
docker-compose ps
```

### 2. Criar Migration
```bash
cd apps/api
npx prisma migrate dev --name init
```

Isso criará:
- Tabela `users`
- Tabela `sessions`
- Tabela `refresh_tokens`
- Tabela `audit_logs`
- Enums `UserRole` e `UserStatus`

### 3. Gerar Prisma Client
```bash
npx prisma generate
```

### 4. Verificar no Prisma Studio
```bash
npx prisma studio
```

Acessar: http://localhost:5555

### 5. Testar Conexões

#### Teste 1: Health Check
```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "storage": { "status": "up" }
  }
}
```

#### Teste 2: Registrar Usuário
```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "Senha123"
  }'
```

Resposta esperada:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "teste@exemplo.com",
    "role": "USER",
    "emailVerified": false
  }
}
```

#### Teste 3: Login
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "Senha123"
  }'
```

#### Teste 4: Rate Limit (6ª tentativa deve falhar)
```bash
# Fazer 6 tentativas de login em menos de 15 minutos
for i in {1..6}; do
  curl -X POST http://localhost:3000/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "teste@exemplo.com", "password": "errado"}'
  echo "---"
done
```

A 6ª tentativa deve retornar:
```json
{
  "statusCode": 429,
  "message": "Muitas requisições. Tente novamente mais tarde.",
  "retryAfter": 897
}
```

#### Teste 5: Refresh Token
```bash
curl -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "seu-refresh-token-aqui"
  }'
```

Verificar no banco que o token antigo foi revogado e um novo foi criado.

#### Teste 6: Logout
```bash
curl -X POST http://localhost:3000/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "seu-refresh-token-aqui"
  }'
```

---

## 📊 Validação Final

| Teste | Esperado | Status |
|-------|----------|--------|
| Containers up | ✅ | ___ |
| Migration aplicada | ✅ | ___ |
| Prisma Client gerado | ✅ | ___ |
| Health check | 200 OK | ___ |
| Registro | 201 + tokens | ___ |
| Login | 200 + tokens | ___ |
| Rate limit | 429 após 5 tentativas | ___ |
| Refresh token | Novo par de tokens | ___ |
| Token rotation | Token antigo revogado | ___ |
| Logout | 200 + token revogado | ___ |

---

## 📝 Schema Criado

### Tabelas
- `users` - Usuários do sistema
- `sessions` - Sessões ativas
- `refresh_tokens` - Tokens de refresh (com hash SHA-256)
- `audit_logs` - Logs de auditoria

### Enums
- `UserRole` - USER, PREMIUM, ADMIN, MODERATOR
- `UserStatus` - ACTIVE, SUSPENDED, BANNED, PENDING_VERIFICATION

### Índices
- `refresh_tokens`: userId + revoked + expiresAt
- `audit_logs`: userId + createdAt, correlationId, action + entity

---

*Dia 3 - Semana 1: Foundation*
