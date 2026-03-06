# 🎯 Arquitetura do Feed - VLinked

## Visão Geral

O feed do VLinked é **pré-indexado**, nunca calculado em tempo real.

## Event Flow

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

## Schema FeedItem

```prisma
model FeedItem {
  id          String   @id @default(uuid())
  videoId     String   @map("video_id")
  
  // Score pré-calculado (0-100)
  score       Float    @default(0)
  
  // Fatores de ranking (para debug e re-ranking)
  factors     Json     // { recency: 0.3, engagement: 0.5, quality: 0.2, profile: 0.15 }
  
  // Métricas de performance
  impressions Int      @default(0)
  clicks      Int      @default(0)
  
  // Target audience para personalização futura
  targetAudience Json?
  
  // Expiração para re-indexação
  expiresAt   DateTime?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // ÍNDICE CRÍTICO
  @@index([score, createdAt])
}
```

## Query do Feed

```sql
SELECT * FROM feed_items
WHERE expiresAt IS NULL OR expiresAt > NOW()
ORDER BY score DESC, createdAt DESC
LIMIT 20
```

**NUNCA** calcula score em tempo real.

## Fatores de Ranking

| Fator | Peso | Descrição |
|-------|------|-----------|
| recency | 30% | Idade do vídeo (decaimento exponencial) |
| engagement | 35% | Like rate (likes/views) |
| quality | 20% | Análise da IA (tags, transcrição, sentimento) |
| profile | 15% | Reputação do autor |

## Endpoints

| Endpoint | Descrição |
|----------|-----------|
| `GET /v1/feed` | Feed global (público) |
| `GET /v1/feed/personalized` | Feed personalizado (auth) |
| `GET /v1/feed/user/:userId` | Vídeos de um usuário |

## Cache

- Cache Redis: 5 minutos
- Invalidação automática quando novos itens são indexados

## Paginação

- Cursor-based (não offset)
- Usa `score` + `createdAt` como cursor

## Re-ranking

- Job periódico (semanal) recalcula scores
- Expiração de 7 dias dos FeedItems

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `feed.service.ts` | Consultas do feed |
| `feed-indexer.service.ts` | Calcula score e cria FeedItems |
| `feed.controller.ts` | Endpoints HTTP |
| `video-analyzed.handler.ts` | Handler do evento VIDEO_ANALYZED |
