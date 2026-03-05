'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FeedCard } from '@/components/feed-card/feed-card';
import { feedApi, videoApi } from '@/services/api-client';
import { useFeedStore } from '@/store/feed-store';
import { Home, Compass, Search, User, Briefcase } from 'lucide-react';
import Link from 'next/link';

export default function FeedPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { setItems } = useFeedStore();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => feedApi.getForYou({ cursor: pageParam, limit: 5 }),
    getNextPageParam: (lastPage) => lastPage.data?.nextCursor,
    initialPageParam: undefined as string | undefined,
  });

  const feedItems = data?.pages.flatMap((page) => page.data?.items || []) || [];

  useEffect(() => {
    if (feedItems.length > 0) {
      setItems(feedItems);
    }
  }, [feedItems, setItems]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const windowHeight = window.innerHeight;
    const newIndex = Math.round(scrollTop / windowHeight);

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < feedItems.length) {
      setCurrentIndex(newIndex);
    }
  }, [currentIndex, feedItems.length]);

  const handleVideoView = useCallback(async (videoId: string, watchTime: number, percentWatched: number) => {
    try {
      await videoApi.trackView(videoId, {
        watchTime,
        percentWatched,
        completed: percentWatched >= 90,
        skipped: percentWatched < 50 && watchTime < 10,
      });
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScrollEnd = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollTop + clientHeight >= scrollHeight - 100 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    container.addEventListener('scroll', handleScroll);
    container.addEventListener('scroll', handleScrollEnd);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('scroll', handleScrollEnd);
    };
  }, [handleScroll, fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (status === 'pending') {
    return (
      <div className="h-screen flex items-center justify-center bg-vlinked-dark">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-vlinked-dark">
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto snap-y snap-mandatory hide-scrollbar"
      >
        {feedItems.map((item, index) => (
          <FeedCard
            key={item.id}
            item={item}
            isActive={index === currentIndex}
            onView={handleVideoView}
          />
        ))}

        {isFetchingNextPage && (
          <div className="h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!hasNextPage && feedItems.length > 0 && (
          <div className="h-32 flex items-center justify-center text-white/50">
            Fim do feed
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-vlinked-card/90 backdrop-blur-lg border-t border-vlinked-border">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2">
          <Link href="/" className="flex flex-col items-center gap-1 p-2 text-primary-500">
            <Home className="w-6 h-6" />
            <span className="text-xs">Feed</span>
          </Link>
          <Link href="/discovery" className="flex flex-col items-center gap-1 p-2 text-white/60 hover:text-white">
            <Compass className="w-6 h-6" />
            <span className="text-xs">Descobrir</span>
          </Link>
          <Link href="/services" className="flex flex-col items-center gap-1 p-2 text-white/60 hover:text-white">
            <Briefcase className="w-6 h-6" />
            <span className="text-xs">Serviços</span>
          </Link>
          <Link href="/search" className="flex flex-col items-center gap-1 p-2 text-white/60 hover:text-white">
            <Search className="w-6 h-6" />
            <span className="text-xs">Buscar</span>
          </Link>
          <Link href="/profile/me" className="flex flex-col items-center gap-1 p-2 text-white/60 hover:text-white">
            <User className="w-6 h-6" />
            <span className="text-xs">Perfil</span>
          </Link>
        </div>
      </nav>

      <div className="h-16" />
    </div>
  );
}
