# VLinked

> **TikTok for Professionals** - A short-form video platform connecting professionals and services.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg)](https://redis.io/)

## 🎯 Overview

VLinked is a professional networking platform that combines short-form video content with service discovery. Professionals can showcase their expertise through videos, connect with potential clients, and offer services directly on the platform.

### Key Features

- 📹 **Short-form video feed** - TikTok-style vertical video feed
- 🔍 **Service discovery** - Find and hire professionals by category/location
- 👤 **Professional profiles** - Showcase expertise with videos and portfolios
- 💬 **Interactions** - Likes, comments, follows, and shares
- 🤖 **AI-powered analysis** - Automatic transcription and tagging
- 📊 **Analytics** - View metrics and engagement tracking

## 🏗️ Architecture

```
vlinked/
├── apps/
│   └── api/              # Backend API (Node.js + Express)
│       ├── src/
│       │   ├── modules/  # Feature modules
│       │   ├── shared/   # Shared utilities
│       │   └── workers/  # Background workers
│       └── prisma/       # Database schema
├── web/                  # Frontend (Next.js 14)
│   ├── app/              # App Router pages
│   ├── components/       # React components
│   ├── services/         # API client
│   └── store/            # Zustand stores
├── scripts/              # Development scripts
└── docker-compose.yml    # Infrastructure services
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript, TailwindCSS |
| State | Zustand, TanStack Query |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16, Prisma ORM |
| Cache/Queue | Redis, BullMQ |
| Storage | MinIO (S3-compatible) |
| Video | FFmpeg, HLS.js |
| AI | OpenAI Whisper, GPT-4 |

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) & Docker Compose
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/vlinked.git
   cd vlinked
   ```

2. **Start development environment**
   ```bash
   ./scripts/dev-up.sh
   ```

   This script will:
   - Start PostgreSQL, Redis, and MinIO containers
   - Run database migrations
   - Seed the database
   - Start the API server (port 3001)
   - Start the web frontend (port 3000)

3. **Access the application**
   - Web App: http://localhost:3000
   - API: http://localhost:3001
   - MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

### Manual Setup (Alternative)

If you prefer to run services manually:

```bash
# Start infrastructure
docker-compose up -d postgres redis minio

# Setup API
cd apps/api
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# Setup Web (in another terminal)
cd web
npm install
npm run dev
```

## 📁 Project Structure

### API (`apps/api`)

```
api/
├── src/
│   ├── modules/
│   │   ├── auth/         # Authentication (JWT, OAuth)
│   │   ├── profile/      # User profiles
│   │   ├── quota/        # Usage quotas
│   │   ├── studio/       # Video upload & processing
│   │   ├── feed/         # Feed generation
│   │   ├── interactions/ # Likes, comments, follows
│   │   ├── analytics/    # Metrics & events
│   │   └── discovery/    # Service discovery
│   ├── shared/           # Utilities, middleware, types
│   └── workers/          # Background job workers
├── prisma/
│   └── schema.prisma     # Database schema
└── Dockerfile
```

### Web (`web`)

```
web/
├── app/                  # Next.js App Router
│   ├── page.tsx          # Home feed
│   ├── video/[id]/       # Video detail page
│   ├── profile/[id]/     # Profile page
│   ├── discovery/        # Discovery page
│   └── services/         # Services listing
├── components/
│   ├── video-player/     # HLS video player
│   ├── feed-card/        # Feed item card
│   ├── profile-card/     # Profile header card
│   └── service-card/     # Service listing card
├── services/
│   └── api-client.ts     # Axios API client
└── store/
    ├── user-store.ts     # User state
    └── feed-store.ts     # Feed state
```

## 🔧 Configuration

### Environment Variables

Create `.env` files in respective directories:

**apps/api/.env**
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://vlinked:vlinked_password@localhost:5432/vlinked
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=vlinked-uploads
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
OPENAI_API_KEY=your-openai-key
```

**web/.env.local**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 📝 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout

### Profile
- `GET /profiles/:id` - Get profile
- `PATCH /profiles/me` - Update my profile
- `GET /profiles/:id/videos` - Get user's videos

### Feed
- `GET /feed/personalized` - Personalized feed
- `GET /feed/for-you` - For you feed
- `GET /feed/following` - Following feed
- `GET /feed/trending` - Trending videos
- `GET /feed/services` - Service discovery feed

### Videos
- `POST /videos/upload` - Request upload URL
- `GET /videos/:id` - Get video details
- `DELETE /videos/:id` - Delete video

### Interactions
- `POST /interactions/like` - Like/unlike video
- `POST /interactions/follow` - Follow/unfollow user
- `GET /interactions/comments/:videoId` - Get comments
- `POST /interactions/comments` - Add comment

### Discovery
- `GET /discovery/trending` - Trending topics
- `GET /discovery/creators` - Trending creators
- `GET /discovery/nearby` - Nearby services

## 🧪 Development

### Database Commands

```bash
cd apps/api

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Reset database
npx prisma migrate reset

# Seed database
npx prisma db seed

# Open Prisma Studio
npx prisma studio
```

### Running Workers

```bash
# Video processing worker
cd apps/api && npm run worker:video

# AI analysis worker
cd apps/api && npm run worker:ai

# Feed indexer
cd apps/api && npm run indexer:feed
```

### Code Quality

```bash
# Run linter
cd apps/api && npm run lint
cd web && npm run lint

# Type check
cd apps/api && npx tsc --noEmit
cd web && npx tsc --noEmit
```

## 🚢 Deployment

### Docker Production Build

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Requirements

- **CPU**: 2+ cores (4+ recommended for video processing)
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 50GB+ for video storage
- **Network**: Good upload bandwidth for video streaming

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FFmpeg](https://ffmpeg.org/) for video processing
- [HLS.js](https://github.com/video-dev/hls.js/) for video streaming
- [OpenAI](https://openai.com/) for AI analysis
- [Prisma](https://www.prisma.io/) for database ORM
- [BullMQ](https://docs.bullmq.io/) for job queues

---

<p align="center">
  Built with ❤️ for professionals worldwide
</p>
