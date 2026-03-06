# VLinked Web Frontend

Frontend web application for VLinked - Professional video platform.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI + shadcn/ui
- **State Management**: React Context + Hooks
- **HTTP Client**: Axios
- **Video Player**: HLS.js

## Features

### Implemented

- **Authentication**: Login, Register, Protected Routes
- **Feed**: Infinite scroll with lazy loading, video preloading
- **Video Player**: HLS streaming with lazy loading (IntersectionObserver)
- **Profile**: View and edit user profile
- **Upload**: Drag & drop video upload with progress
- **Search**: Full-text search with filters
- **Interactions**: Like, comment, share, follow
- **Onboarding**: Multi-step wizard after registration
- **Skeleton Loading**: Loading states for better UX

### UX Improvements

1. **Lazy Loading**: Videos only load when visible in viewport
2. **Preload Next Video**: Smooth scrolling experience
3. **Skeleton Loading**: Visual feedback during loading
4. **Onboarding Flow**: Collect user info after registration

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── feed/              # Feed page
│   ├── login/             # Login page
│   ├── register/          # Register page
│   ├── onboarding/        # Onboarding wizard
│   ├── upload/            # Upload page
│   ├── video/[id]/        # Video detail page
│   ├── profile/[id]/      # Profile page
│   ├── search/            # Search page
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home redirect
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # UI components (shadcn)
│   ├── VideoPlayer.tsx   # HLS video player
│   ├── LazyVideo.tsx     # Lazy loading wrapper
│   ├── VideoCard.tsx     # Video card component
│   ├── FeedItem.tsx      # Feed item component
│   ├── CommentSection.tsx # Comments component
│   └── skeleton.tsx      # Skeleton components
├── contexts/             # React contexts
│   └── AuthContext.tsx   # Authentication context
├── hooks/                # Custom hooks
│   └── useFeed.ts        # Feed data hook
├── lib/                  # Utilities
│   ├── api.ts           # API client
│   └── utils.ts         # Helper functions
└── types/               # TypeScript types
    └── index.ts         # Shared types
```

## Deployment

### Docker

```bash
docker build -t vlinked-web .
docker run -p 3000:3000 vlinked-web
```

### Fly.io

```bash
fly deploy
```

## License

MIT
