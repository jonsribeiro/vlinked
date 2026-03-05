"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { VideoPlayer } from "@/components/video-player/video-player";
import { api } from "@/services/api-client";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ChevronLeft,
  Verified,
  Briefcase,
} from "lucide-react";
import { useState } from "react";

interface VideoDetail {
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
  transcription: string | null;
}

export default function VideoPage() {
  const params = useParams();
  const videoId = params.id as string;
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const { data: video, isLoading } = useQuery({
    queryKey: ["video", videoId],
    queryFn: async () => {
      const response = await api.get(`/videos/${videoId}`);
      return response.data as VideoDetail;
    },
    enabled: !!videoId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        Vídeo não encontrado
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <Link
          href="/"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Video Section */}
        <div className="flex-1 lg:h-screen">
          <VideoPlayer
            videoUrl={video.videoUrl}
            thumbnailUrl={video.thumbnailUrl}
            autoPlay
            className="w-full h-[60vh] lg:h-full"
          />
        </div>

        {/* Info Section */}
        <div className="lg:w-[400px] bg-white dark:bg-gray-900 lg:h-screen lg:overflow-y-auto">
          <div className="p-4">
            {/* Author */}
            <Link
              href={`/profile/${video.author.id}`}
              className="flex items-center gap-3 mb-4"
            >
              <div className="relative w-12 h-12 rounded-full overflow-hidden">
                {video.author.avatarUrl ? (
                  <Image
                    src={video.author.avatarUrl}
                    alt={video.author.displayName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                    {video.author.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {video.author.displayName}
                  </span>
                  {video.author.isVerified && (
                    <Verified className="w-4 h-4 text-blue-500 fill-blue-500" />
                  )}
                </div>
                {video.author.headline && (
                  <div className="flex items-center gap-1 text-gray-500 text-sm">
                    <Briefcase className="w-3 h-3" />
                    <span>{video.author.headline}</span>
                  </div>
                )}
              </div>
              <button className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-full">
                Seguir
              </button>
            </Link>

            {/* Caption */}
            <p className="text-gray-900 dark:text-white mb-3">{video.caption}</p>

            {/* Tags */}
            {video.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {video.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/search?q=${encodeURIComponent(tag)}`}
                    className="text-blue-600 dark:text-blue-400 text-sm hover:underline"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Meta */}
            <div className="text-sm text-gray-500 mb-4">
              {timeAgo(video.createdAt)} • {formatNumber(video.metrics.views)}{" "}
              visualizações
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between py-4 border-y border-gray-200 dark:border-gray-800 mb-4">
              <button
                onClick={() => setIsLiked(!isLiked)}
                className="flex flex-col items-center gap-1"
              >
                <Heart
                  className={cn(
                    "w-6 h-6",
                    isLiked ? "text-red-500 fill-red-500" : "text-gray-600 dark:text-gray-400"
                  )}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {formatNumber(video.metrics.likes)}
                </span>
              </button>

              <button className="flex flex-col items-center gap-1">
                <MessageCircle className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {formatNumber(video.metrics.comments)}
                </span>
              </button>

              <button
                onClick={() => setIsSaved(!isSaved)}
                className="flex flex-col items-center gap-1"
              >
                <Bookmark
                  className={cn(
                    "w-6 h-6",
                    isSaved ? "text-yellow-400 fill-yellow-400" : "text-gray-600 dark:text-gray-400"
                  )}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">Salvar</span>
              </button>

              <button className="flex flex-col items-center gap-1">
                <Share2 className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {formatNumber(video.metrics.shares)}
                </span>
              </button>
            </div>

            {/* Transcription */}
            {video.transcription && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Transcrição
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-4">
                  {video.transcription}
                </p>
              </div>
            )}

            {/* Comments Section Placeholder */}
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                Comentários ({formatNumber(video.metrics.comments)})
              </h3>
              <div className="text-center text-gray-500 py-8">
                Comentários em breve
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
