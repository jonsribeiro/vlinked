import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = Cookies.get('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });
          
          const { accessToken } = response.data;
          Cookies.set('accessToken', accessToken, { expires: 1 });
          
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        Cookies.remove('accessToken');
        Cookies.remove('refreshToken');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    apiClient.post('/auth/register', { email, password, name }),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
  refresh: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),
};

export const feedApi = {
  getFeed: (params?: { cursor?: string; limit?: number }) =>
    apiClient.get('/feed', { params }),
  getForYou: (params?: { cursor?: string; limit?: number }) =>
    apiClient.get('/feed/for-you', { params }),
  getTrending: (params?: { timeframe?: string; limit?: number }) =>
    apiClient.get('/feed/trending', { params }),
  getByTag: (tag: string, params?: { cursor?: string; limit?: number }) =>
    apiClient.get(`/feed/by-tag/${tag}`, { params }),
  getRelated: (videoId: string, params?: { limit?: number }) =>
    apiClient.get(`/feed/related/${videoId}`, { params }),
};

export const serviceDiscoveryApi = {
  discoverServices: (params?: {
    category?: string;
    city?: string;
    region?: string;
    cursor?: string;
    limit?: number;
  }) => apiClient.get('/feed/services', { params }),
  getCategories: () => apiClient.get('/feed/services/categories'),
  getPopularCategories: (limit?: number) =>
    apiClient.get('/feed/services/categories/popular', { params: { limit } }),
  getProfessionalsByCategory: (
    category: string,
    params?: { city?: string; region?: string; cursor?: string; limit?: number }
  ) => apiClient.get(`/feed/services/categories/${category}/professionals`, { params }),
  getNearbyProfessionals: (params: {
    city: string;
    region: string;
    category?: string;
    limit?: number;
  }) => apiClient.get('/feed/services/nearby', { params }),
};

export const videoApi = {
  getVideo: (id: string) => apiClient.get(`/videos/${id}`),
  like: (id: string) => apiClient.post(`/videos/${id}/like`),
  unlike: (id: string) => apiClient.delete(`/videos/${id}/like`),
  getComments: (id: string, params?: { cursor?: string; limit?: number }) =>
    apiClient.get(`/videos/${id}/comments`, { params }),
  addComment: (id: string, content: string, parentId?: string) =>
    apiClient.post(`/videos/${id}/comment`, { content, parentId }),
  deleteComment: (commentId: string) =>
    apiClient.delete(`/comments/${commentId}`),
  share: (id: string, platform: string) =>
    apiClient.post(`/videos/${id}/share`, { platform }),
  trackView: (id: string, data: {
    watchTime: number;
    percentWatched?: number;
    completed?: boolean;
    skipped?: boolean;
    skipAt?: number;
    videoDuration?: number;
  }) => apiClient.post(`/videos/${id}/view`, data),
};

export const profileApi = {
  getProfile: (id: string) => apiClient.get(`/profiles/${id}`),
  getMyProfile: () => apiClient.get('/profiles/me'),
  updateProfile: (data: Partial<Profile>) =>
    apiClient.patch('/profiles/me', data),
  follow: (id: string) => apiClient.post(`/profiles/${id}/follow`),
  unfollow: (id: string) => apiClient.delete(`/profiles/${id}/follow`),
  getFollowers: (id: string, params?: { cursor?: string; limit?: number }) =>
    apiClient.get(`/profiles/${id}/followers`, { params }),
  getFollowing: (id: string, params?: { cursor?: string; limit?: number }) =>
    apiClient.get(`/profiles/${id}/following`, { params }),
  getVideos: (id: string, params?: { cursor?: string; limit?: number }) =>
    apiClient.get(`/profiles/${id}/videos`, { params }),
};

export const searchApi = {
  search: (query: string, params?: {
    type?: 'all' | 'videos' | 'users' | 'tags';
    cursor?: string;
    limit?: number;
  }) => apiClient.get('/search', { params: { q: query, ...params } }),
  getSuggestions: (query: string, limit?: number) =>
    apiClient.get('/search/suggestions', { params: { q: query, limit } }),
  getTrendingSearches: (limit?: number) =>
    apiClient.get('/search/trending', { params: { limit } }),
};

export const discoveryApi = {
  getTrending: () => apiClient.get('/discovery/trending'),
  getTrendingVideos: (limit?: number) =>
    apiClient.get('/discovery/trending/videos', { params: { limit } }),
  getTrendingHashtags: (limit?: number) =>
    apiClient.get('/discovery/trending/hashtags', { params: { limit } }),
  getTrendingCreators: (limit?: number) =>
    apiClient.get('/discovery/trending/creators', { params: { limit } }),
  getCategories: () => apiClient.get('/discovery/categories'),
};

export interface Profile {
  id: string;
  displayName: string;
  slug: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  profession?: string;
  serviceCategory?: string;
  skills: string[];
  city?: string;
  region?: string;
  country?: string;
  isAvailableForHire: boolean;
  reputationScore: number;
  followersCount: number;
  followingCount: number;
  videosCount: number;
}

export interface Video {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  hlsUrl?: string;
  duration?: number;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  serviceCategory?: string;
  aiTags: string[];
  author: Profile;
  createdAt: string;
}

export interface FeedItem {
  id: string;
  video: Video;
  author: Profile;
  score: number;
  factors?: {
    recency: number;
    engagement: number;
    aiRelevance: number;
    profileScore: number;
  };
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  professionalsCount: number;
  videosCount: number;
}

export interface Comment {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  createdAt: string;
  likesCount: number;
  repliesCount: number;
  parentId?: string;
}
