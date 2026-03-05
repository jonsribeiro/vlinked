"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { VideoPlayer } from "@/components/video-player/video-player";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Verified,
  Briefcase,
} from "lucide-react";

interface FeedItem {
  id: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
    headline: string | null;
  };
  tags: string[];
}

interface FeedCardProps {
  item: FeedItem;
  isActive?: boolean;
  className?: string;
  onLike?: (id: string) => void;
  onComment?: (id: string) => void;
  onShare?: (id: string) => void;
  onSave?: (id: string) => void;
}

export function FeedCard({
  item,
  isActive = false,
  className,
  onLike,
  onComment,
  onShare,
  onSave,
}: FeedCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(item.metrics.likes);

  const handleLike = () => {
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));
    onLike?.(item.id);
  };

  const handleSave = () => {
    setIsSaved(!isSaved);
    onSave?.(item.id);
  };

  return (
    <div
      className={cn(
        "relative w-full h-[calc(100vh-80px)] md:h-[600px] bg-black rounded-xl overflow-hidden",
        className
      )}
    >
      {/* Video Player */}
      <VideoPlayer
        videoUrl={item.videoUrl}
        thumbnailUrl={item.thumbnailUrl}
        autoPlay={isActive}
        loop
        muted
        className="absolute inset-0"
      />

      {/* Right Side Actions */}
      <div className="absolute right-4 bottom-20 flex flex-col items-center gap-4">
        {/* Like */}
        <button
          onClick={handleLike}
          className="flex flex-col items-center gap-1 group"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-colors">
            <Heart
              className={cn(
                "w-6 h-6 transition-colors",
                isLiked ? "text-red-500 fill-red-500" : "text-white"
              )}
            />
          </div>
          <span className="text-white text-xs font-medium">
            {formatNumber(likeCount)}
          </span>
        </button>

        {/* Comment */}
        <button
          onClick={() => onComment?.(item.id)}
          className="flex flex-col items-center gap-1 group"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-colors">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium">
            {formatNumber(item.metrics.comments)}
          </span>
        </button>

        {/* Save */}
        <button
          onClick={handleSave}
          className="flex flex-col items-center gap-1 group"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-colors">
            <Bookmark
              className={cn(
                "w-6 h-6 transition-colors",
                isSaved ? "text-yellow-400 fill-yellow-400" : "text-white"
              )}
            />
          </div>
          <span className="text-white text-xs font-medium">Salvar</span>
        </button>

        {/* Share */}
        <button
          onClick={() => onShare?.(item.id)}
          className="flex flex-col items-center gap-1 group"
        >
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-colors">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium">
            {formatNumber(item.metrics.shares)}
          </span>
        </button>

        {/* More */}
        <button className="flex flex-col items-center gap-1 group">
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-colors">
            <MoreHorizontal className="w-6 h-6 text-white" />
          </div>
        </button>
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        {/* Author */}
        <Link
          href={`/profile/${item.author.id}`}
          className="flex items-center gap-3 mb-3 group"
        >
          <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/20">
            {item.author.avatarUrl ? (
              <Image
                src={item.author.avatarUrl}
                alt={item.author.displayName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                {item.author.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-white font-semibold truncate">
                {item.author.displayName}
              </span>
              {item.author.isVerified && (
                <Verified className="w-4 h-4 text-blue-400 fill-blue-400" />
              )}
            </div>
            {item.author.headline && (
              <div className="flex items-center gap-1 text-white/70 text-sm">
                <Briefcase className="w-3 h-3" />
                <span className="truncate">{item.author.headline}</span>
              </div>
            )}
          </div>
          <button className="px-4 py-1.5 bg-white text-black text-sm font-semibold rounded-full hover:bg-white/90 transition-colors">
            Seguir
          </button>
        </Link>

        {/* Caption */}
        <p className="text-white text-sm mb-2 line-clamp-2">{item.caption}</p>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {item.tags.map((tag) => (
              <Link
                key={tag}
                href={`/search?q=${encodeURIComponent(tag)}`}
                className="text-blue-300 text-sm hover:underline"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 text-white/60 text-xs">
          <span>{timeAgo(item.createdAt)}</span>
          <span>•</span>
          <span>{formatNumber(item.metrics.views)} visualizações</span>
        </div>
      </div>
    </div>
  );
}
