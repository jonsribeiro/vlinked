"use client";

import Link from "next/link";
import Image from "next/image";
import { cn, formatNumber } from "@/lib/utils";
import { Star, MapPin, Briefcase, Verified } from "lucide-react";

interface ServiceCardProps {
  service: {
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string | null;
    price: number | null;
    priceType: "fixed" | "hourly" | "quote" | null;
    rating: number;
    reviewCount: number;
    category: string;
    location: string | null;
    isRemote: boolean;
    provider: {
      id: string;
      displayName: string;
      avatarUrl: string | null;
      isVerified: boolean;
      headline: string | null;
    };
  };
  className?: string;
  onContact?: (id: string) => void;
}

export function ServiceCard({ service, className, onContact }: ServiceCardProps) {
  const formatPrice = () => {
    if (service.price === null) return "Sob consulta";
    const prefix = service.priceType === "hourly" ? "/h" : "";
    return `R$ ${service.price.toLocaleString("pt-BR")}${prefix}`;
  };

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow",
        className
      )}
    >
      {/* Thumbnail */}
      <Link href={`/services/${service.id}`} className="block relative aspect-video">
        {service.thumbnailUrl ? (
          <Image
            src={service.thumbnailUrl}
            alt={service.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
            <Briefcase className="w-12 h-12 text-gray-400" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="px-2 py-1 bg-black/60 backdrop-blur-sm text-white text-xs rounded-full">
            {service.category}
          </span>
        </div>
        {service.isRemote && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 bg-green-500/80 backdrop-blur-sm text-white text-xs rounded-full">
              Remoto
            </span>
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="p-4">
        {/* Provider */}
        <Link
          href={`/profile/${service.provider.id}`}
          className="flex items-center gap-2 mb-2 group"
        >
          <div className="relative w-8 h-8 rounded-full overflow-hidden">
            {service.provider.avatarUrl ? (
              <Image
                src={service.provider.avatarUrl}
                alt={service.provider.displayName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                {service.provider.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-0.5">
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {service.provider.displayName}
              </span>
              {service.provider.isVerified && (
                <Verified className="w-3 h-3 text-blue-500 fill-blue-500 flex-shrink-0" />
              )}
            </div>
            {service.provider.headline && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {service.provider.headline}
              </p>
            )}
          </div>
        </Link>

        {/* Title */}
        <Link href={`/services/${service.id}`}>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2 hover:underline">
            {service.title}
          </h3>
        </Link>

        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {service.description}
        </p>

        {/* Rating */}
        <div className="flex items-center gap-1 mb-3">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  "w-4 h-4",
                  star <= Math.round(service.rating)
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-gray-300"
                )}
              />
            ))}
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {service.rating.toFixed(1)}
          </span>
          <span className="text-sm text-gray-400">
            ({formatNumber(service.reviewCount)})
          </span>
        </div>

        {/* Location */}
        {service.location && (
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-3">
            <MapPin className="w-4 h-4" />
            <span>{service.location}</span>
          </div>
        )}

        {/* Price & CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-800">
          <div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {formatPrice()}
            </span>
          </div>
          <button
            onClick={() => onContact?.(service.id)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Contatar
          </button>
        </div>
      </div>
    </div>
  );
}
