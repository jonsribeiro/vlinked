"use client";

import Link from "next/link";
import Image from "next/image";
import { cn, formatNumber } from "@/lib/utils";
import { Verified, MapPin, Briefcase, Link as LinkIcon } from "lucide-react";

interface ProfileCardProps {
  profile: {
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
  };
  isFollowing?: boolean;
  className?: string;
  onFollow?: (id: string) => void;
}

export function ProfileCard({
  profile,
  isFollowing = false,
  className,
  onFollow,
}: ProfileCardProps) {
  return (
    <div className={cn("bg-white dark:bg-gray-900 rounded-xl overflow-hidden", className)}>
      {/* Banner */}
      <div className="relative h-32 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
        {profile.bannerUrl && (
          <Image
            src={profile.bannerUrl}
            alt=""
            fill
            className="object-cover"
          />
        )}
      </div>

      {/* Avatar & Actions */}
      <div className="px-4 pb-4">
        <div className="flex justify-between items-start -mt-12 mb-3">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-white dark:border-gray-900 bg-gray-200">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt={profile.displayName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
                {profile.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <button
            onClick={() => onFollow?.(profile.id)}
            className={cn(
              "mt-14 px-6 py-2 rounded-full font-semibold text-sm transition-colors",
              isFollowing
                ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            {isFollowing ? "Seguindo" : "Seguir"}
          </button>
        </div>

        {/* Name & Handle */}
        <div className="mb-3">
          <div className="flex items-center gap-1">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {profile.displayName}
            </h2>
            {profile.isVerified && (
              <Verified className="w-5 h-5 text-blue-500 fill-blue-500" />
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400">@{profile.handle}</p>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="text-gray-900 dark:text-white text-sm mb-3 whitespace-pre-wrap">
            {profile.bio}
          </p>
        )}

        {/* Info */}
        <div className="flex flex-wrap gap-3 mb-3 text-sm text-gray-500 dark:text-gray-400">
          {profile.headline && (
            <div className="flex items-center gap-1">
              <Briefcase className="w-4 h-4" />
              <span>{profile.headline}</span>
            </div>
          )}
          {profile.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{profile.location}</span>
            </div>
          )}
          {profile.website && (
            <Link
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:underline"
            >
              <LinkIcon className="w-4 h-4" />
              <span>{new URL(profile.website).hostname}</span>
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm">
          <Link
            href={`/profile/${profile.id}/following`}
            className="hover:underline"
          >
            <span className="font-bold text-gray-900 dark:text-white">
              {formatNumber(profile.stats.following)}
            </span>{" "}
            <span className="text-gray-500 dark:text-gray-400">seguindo</span>
          </Link>
          <Link
            href={`/profile/${profile.id}/followers`}
            className="hover:underline"
          >
            <span className="font-bold text-gray-900 dark:text-white">
              {formatNumber(profile.stats.followers)}
            </span>{" "}
            <span className="text-gray-500 dark:text-gray-400">seguidores</span>
          </Link>
          <div>
            <span className="font-bold text-gray-900 dark:text-white">
              {formatNumber(profile.stats.likes)}
            </span>{" "}
            <span className="text-gray-500 dark:text-gray-400">curtidas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
