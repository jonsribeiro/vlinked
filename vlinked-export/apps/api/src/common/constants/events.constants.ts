// ============================================
// EVENTOS DE DOMÍNIO - VLINKED
// ============================================

export const DomainEvents = {
  // Video Pipeline Events
  VIDEO_UPLOADED: 'video.uploaded',
  VIDEO_PROCESSED: 'video.processed',
  VIDEO_ANALYZED: 'video.analyzed',
  VIDEO_INDEXED: 'video.indexed',
  VIDEO_PUBLISHED: 'video.published',

  // User Events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Engagement Events
  VIDEO_VIEWED: 'video.viewed',
  VIDEO_LIKED: 'video.liked',
  VIDEO_UNLIKED: 'video.unliked',
  VIDEO_COMMENTED: 'video.commented',
  USER_FOLLOWED: 'user.followed',
  USER_UNFOLLOWED: 'user.unfollowed',

  // Business Events
  OPPORTUNITY_CREATED: 'opportunity.created',
  OPPORTUNITY_APPLIED: 'opportunity.applied',
  PROPOSAL_SENT: 'proposal.sent',
  PROPOSAL_ACCEPTED: 'proposal.accepted',
  REVIEW_CREATED: 'review.created',

  // Chat Events
  MESSAGE_SENT: 'message.sent',
  CONVERSATION_CREATED: 'conversation.created',

  // Notification Events
  NOTIFICATION_CREATED: 'notification.created',
} as const;

export type DomainEventType = typeof DomainEvents[keyof typeof DomainEvents];

// Interface base para eventos
export interface DomainEvent<T = any> {
  eventId: string;
  eventType: DomainEventType;
  aggregateId: string;
  payload: T;
  metadata: {
    userId?: string;
    correlationId: string;
    timestamp: string;
  };
}
