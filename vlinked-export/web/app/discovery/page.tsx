"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { api } from "@/services/api-client";
import { cn, formatNumber } from "@/lib/utils";
import { Search, TrendingUp, Hash, MapPin, Play } from "lucide-react";

interface TrendingTopic {
  tag: string;
  videoCount: number;
  trendingScore: number;
}

interface TrendingCreator {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  headline: string | null;
  followerCount: number;
}

interface NearbyService {
  id: string;
  title: string;
  category: string;
  provider: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  distance: number;
}

export default function DiscoveryPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: trendingTopics } = useQuery({
    queryKey: ["trending-topics"],
    queryFn: async () => {
      const response = await api.get("/discovery/trending");
      return response.data.topics as TrendingTopic[];
    },
  });

  const { data: trendingCreators } = useQuery({
    queryKey: ["trending-creators"],
    queryFn: async () => {
      const response = await api.get("/discovery/creators");
      return response.data.creators as TrendingCreator[];
    },
  });

  const { data: nearbyServices } = useQuery({
    queryKey: ["nearby-services"],
    queryFn: async () => {
      const response = await api.get("/discovery/nearby");
      return response.data.services as NearbyService[];
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-4xl mx-auto p-4">
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar vídeos, profissionais, serviços..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-100 dark:bg-gray-900 rounded-full text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </form>

        {/* Trending Topics */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Em Alta
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingTopics?.map((topic) => (
              <Link
                key={topic.tag}
                href={`/search?q=${encodeURIComponent(topic.tag)}`}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-900 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              >
                <Hash className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900 dark:text-white font-medium">
                  {topic.tag}
                </span>
                <span className="text-gray-500 text-sm">
                  {formatNumber(topic.videoCount)}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Trending Creators */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Criadores em Destaque
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {trendingCreators?.map((creator) => (
              <Link
                key={creator.id}
                href={`/profile/${creator.id}`}
                className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="relative w-16 h-16 rounded-full overflow-hidden mb-2">
                  {creator.avatarUrl ? (
                    <Image
                      src={creator.avatarUrl}
                      alt={creator.displayName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                      {creator.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="font-semibold text-gray-900 dark:text-white text-center truncate w-full">
                  {creator.displayName}
                </span>
                {creator.headline && (
                  <span className="text-xs text-gray-500 text-center truncate w-full">
                    {creator.headline}
                  </span>
                )}
                <span className="text-xs text-gray-400 mt-1">
                  {formatNumber(creator.followerCount)} seguidores
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Nearby Services */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Serviços Próximos
            </h2>
          </div>
          <div className="space-y-3">
            {nearbyServices?.map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.id}`}
                className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                  <div className="w-full h-full flex items-center justify-center">
                    <Play className="w-6 h-6 text-gray-400" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full mb-1">
                    {service.category}
                  </span>
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {service.title}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{service.provider.displayName}</span>
                    <span>•</span>
                    <span>{service.distance.toFixed(1)} km</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Categories */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Categorias
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { id: "technology", name: "Tecnologia", color: "from-blue-500 to-cyan-500" },
              { id: "design", name: "Design", color: "from-purple-500 to-pink-500" },
              { id: "marketing", name: "Marketing", color: "from-orange-500 to-red-500" },
              { id: "consulting", name: "Consultoria", color: "from-green-500 to-emerald-500" },
              { id: "legal", name: "Jurídico", color: "from-indigo-500 to-blue-500" },
              { id: "finance", name: "Finanças", color: "from-yellow-500 to-orange-500" },
              { id: "health", name: "Saúde", color: "from-red-500 to-rose-500" },
              { id: "education", name: "Educação", color: "from-teal-500 to-green-500" },
              { id: "engineering", name: "Engenharia", color: "from-gray-500 to-slate-500" },
            ].map((category) => (
              <Link
                key={category.id}
                href={`/services?category=${category.id}`}
                className={cn(
                  "relative h-24 rounded-xl overflow-hidden bg-gradient-to-br p-4 hover:opacity-90 transition-opacity",
                  category.color
                )}
              >
                <span className="relative z-10 font-semibold text-white">
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
