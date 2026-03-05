// ============================================
// INTERACTION EVENTS - Event-Driven Architecture
// ============================================

// ==================== VIDEO LIKED ====================

export interface VideoLikedEvent {
  videoId: string;
  userId: string;
  likedAt: Date;
  likesCount: number;
}

export interface VideoUnlikedEvent {
  videoId: string;
  userId: string;
  unlikedAt: Date;
  likesCount: number;
}

// ==================== VIDEO COMMENTED ====================

export interface VideoCommentedEvent {
  commentId: string;
  videoId: string;
  userId: string;
  content: string;
  parentId?: string;
  commentedAt: Date;
  commentsCount: number;
}

export interface CommentDeletedEvent {
  commentId: string;
  videoId: string;
  userId: string;
  deletedAt: Date;
  commentsCount: number;
}

// ==================== PROFILE FOLLOWED ====================

export interface ProfileFollowedEvent {
  followerId: string;
  followingId: string;
  followedAt: Date;
  followersCount: number;
}

export interface ProfileUnfollowedEvent {
  followerId: string;
  followingId: string;
  unfollowedAt: Date;
  followersCount: number;
}

// ==================== VIDEO SHARED ====================

export interface VideoSharedEvent {
  shareId: string;
  videoId: string;
  userId: string;
  platform: string;
  sharedAt: Date;
  sharesCount: number;
}

// ==================== VIDEO VIEWED ====================

export interface VideoViewedEvent {
  viewId: string;
  videoId: string;
  userId?: string;
  watchTime: number;
  percentWatched: number;
  completed: boolean;
  skipped: boolean;
  skipAt?: number;
  viewedAt: Date;
  viewsCount: number;
  
  // Contexto
  ipAddress?: string;
  userAgent?: string;
  country?: string;
  referrer?: string;
}

// ==================== VIEW METRICS UPDATED ====================

export interface ViewMetricsUpdatedEvent {
  videoId: string;
  metrics: {
    totalViews: number;
    uniqueViewers: number;
    avgWatchTime: number;
    avgCompletionRate: number;
    avgSkipRate: number;
    watchTimeDistribution: Record<string, number>;
    dropOffPoints: Record<string, number>;
    retentionCurve: number[];
  };
  updatedAt: Date;
}

// ==================== ANALYTICS EVENT ====================

export interface AnalyticsEventPayload {
  eventType: string;
  userId?: string;
  sessionId?: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  country?: string;
  referrer?: string;
  timestamp: Date;
}
