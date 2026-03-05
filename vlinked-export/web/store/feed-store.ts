import { create } from 'zustand';
import { FeedItem, Video } from '@/services/api-client';

interface FeedState {
  items: FeedItem[];
  currentIndex: number;
  hasMore: boolean;
  isLoading: boolean;
  cursor?: string;
  likedVideos: Set<string>;
  followedProfiles: Set<string>;
  setItems: (items: FeedItem[]) => void;
  appendItems: (items: FeedItem[], hasMore: boolean, cursor?: string) => void;
  setCurrentIndex: (index: number) => void;
  setLoading: (value: boolean) => void;
  likeVideo: (videoId: string) => void;
  unlikeVideo: (videoId: string) => void;
  isLiked: (videoId: string) => boolean;
  followProfile: (profileId: string) => void;
  unfollowProfile: (profileId: string) => void;
  isFollowing: (profileId: string) => boolean;
  updateVideoStats: (videoId: string, stats: Partial<Video>) => void;
  reset: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  items: [],
  currentIndex: 0,
  hasMore: true,
  isLoading: false,
  cursor: undefined,
  likedVideos: new Set(),
  followedProfiles: new Set(),
  setItems: (items) => set({ items, currentIndex: 0 }),
  appendItems: (newItems, hasMore, cursor) => 
    set((state) => ({ 
      items: [...state.items, ...newItems],
      hasMore,
      cursor,
    })),
  setCurrentIndex: (index) => set({ currentIndex: index }),
  setLoading: (value) => set({ isLoading: value }),
  likeVideo: (videoId) => 
    set((state) => {
      const likedVideos = new Set(state.likedVideos);
      likedVideos.add(videoId);
      const items = state.items.map((item) => {
        if (item.video.id === videoId) {
          return {
            ...item,
            video: {
              ...item.video,
              likesCount: item.video.likesCount + 1,
            },
          };
        }
        return item;
      });
      return { likedVideos, items };
    }),
  unlikeVideo: (videoId) => 
    set((state) => {
      const likedVideos = new Set(state.likedVideos);
      likedVideos.delete(videoId);
      const items = state.items.map((item) => {
        if (item.video.id === videoId) {
          return {
            ...item,
            video: {
              ...item.video,
              likesCount: Math.max(0, item.video.likesCount - 1),
            },
          };
        }
        return item;
      });
      return { likedVideos, items };
    }),
  isLiked: (videoId) => get().likedVideos.has(videoId),
  followProfile: (profileId) => 
    set((state) => {
      const followedProfiles = new Set(state.followedProfiles);
      followedProfiles.add(profileId);
      return { followedProfiles };
    }),
  unfollowProfile: (profileId) => 
    set((state) => {
      const followedProfiles = new Set(state.followedProfiles);
      followedProfiles.delete(profileId);
      return { followedProfiles };
    }),
  isFollowing: (profileId) => get().followedProfiles.has(profileId),
  updateVideoStats: (videoId, stats) => 
    set((state) => ({
      items: state.items.map((item) => {
        if (item.video.id === videoId) {
          return {
            ...item,
            video: { ...item.video, ...stats },
          };
        }
        return item;
      }),
    })),
  reset: () => set({
    items: [],
    currentIndex: 0,
    hasMore: true,
    isLoading: false,
    cursor: undefined,
  }),
}));
