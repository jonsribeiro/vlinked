"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/services/api-client";
import { ProfileCard } from "@/components/profile-card/profile-card";
import { cn, formatNumber } from "@/lib/utils";
import { Grid, Play, Briefcase, Bookmark } from "lucide-react";

interface Profile {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isVerified: boolean;
  bio: string | null;
  headline: string | null;
  location: string | null;
  website: string | null;
  stats: {
    followers: number;
    following: number;
    likes: number;
  };
}

interface VideoItem {
  id: string;
  thumbnailUrl: string;
  metrics: {
    views: number;
  };
}

export default function ProfilePage() {
  const params = useParams();
  const profileId = params.id as string;
  const [activeTab, setActiveTab] = useState<"videos" | "services" | "saved">("videos");
  const [isFollowing, setIsFollowing] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", profileId],
    queryFn: async () => {
      const response = await api.get(`/profiles/${profileId}`);
      return response.data as Profile;
    },
    enabled: !!profileId,
  });

  const { data: videos } = useQuery({
    queryKey: ["profile-videos", profileId],
    queryFn: async () => {
      const response = await api.get(`/profiles/${profileId}/videos`);
      return response.data.items as VideoItem[];
    },
    enabled: !!profileId && activeTab === "videos",
  });

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Perfil não encontrado
      </div>
    );
  }

  const tabs = [
    { id: "videos" as const, label: "Vídeos", icon: Grid },
    { id: "services" as const, label: "Serviços", icon: Briefcase },
    { id: "saved" as const, label: "Salvos", icon: Bookmark },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        <ProfileCard
          profile={profile}
          isFollowing={isFollowing}
          onFollow={() => setIsFollowing(!isFollowing)}
        />

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === "videos" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {videos?.map((video) => (
                <Link
                  key={video.id}
                  href={`/video/${video.id}`}
                  className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                >
                  {video.thumbnailUrl ? (
                    <Image
                      src={video.thumbnailUrl}
                      alt=""
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs">
                    <Play className="w-3 h-3" />
                    {formatNumber(video.metrics.views)}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {activeTab === "services" && (
            <div className="text-center py-12 text-gray-500">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Serviços em breve</p>
            </div>
          )}

          {activeTab === "saved" && (
            <div className="text-center py-12 text-gray-500">
              <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Vídeos salvos em breve</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
