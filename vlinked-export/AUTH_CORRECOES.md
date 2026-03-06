# ✅ Correções no Auth - Aplicadas

## 1. Refresh Tokens Armazenados como Hash

### Antes
```prisma
model RefreshToken {
  token     String   @unique  // ❌ Plaintext
}
```

### Depois
```prisma
model RefreshToken {
  tokenHash String   @unique @map("token_hash") // ✅ SHA-256 hash
}
```

### Implementação
```typescript
// Gera token aleatório (32 bytes = 64 chars hex)
const token = crypto.randomBytes(32).toString('hex');

// Hash com SHA-256 (rápido para tokens)
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

// Armazena hash, retorna token ao cliente
```

---

## 2. Refresh Token Rotation

### Implementação
```typescript
async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
  // 1. Valida token (compara hash)
  const storedToken = await this.findTokenByHash(refreshToken, activeTokens);
  
  // 2. Revoga token usado
  await this.prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revoked: true },
  });
  
  // 3. Gera NOVO par de tokens (access + refresh)
  return this.generateTokens({...});
}
```

**Benefícios:**
- Token usado uma única vez
- Se token for roubado e usado, usuário legítimo será deslogado (detecta roubo)
- Sessão sempre renovada

---

## 3. Rate Limit no Login

### Implementação
```typescript
@Post('login')
@RateLimit({ 
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 5,                     // 5 tentativas
  keyPrefix: 'auth_login' 
})
async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
  return this.authService.login(loginDto);
}
```

### Rate Limits por Endpoint
| Endpoint | Janela | Máximo |
|----------|--------|--------|
| /register | 1 hora | 5 |
| /login | 15 min | 5 |
| /refresh | 1 min | 10 |

---

## Arquivos Modificados

1. `prisma/schema.prisma` - token → tokenHash
2. `auth.service.ts` - Hash de tokens + rotation
3. `auth.controller.ts` - @RateLimit decorators
4. `app.module.ts` - RateLimitGuard global
5. `rate-limit.decorator.ts` - Novo
6. `rate-limit.guard.ts` - Novo
7. `decorators/index.ts` - Exportação
8. `guards/index.ts` - Exportação
