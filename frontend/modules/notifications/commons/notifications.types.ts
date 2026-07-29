export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export type NotificationState = 'UNREAD' | 'READ' | 'SNOOZED';

export type NotificationFeedFilter = 'all' | 'unread' | 'attention';

/**
 * Kinds are server-owned stable identifiers. The client never branches on a
 * specific kind for presentation — that belongs in the server registry and
 * is delivered via the `presentation` block below. We keep this union open
 * with `string` on purpose so new kinds do not require a client deploy just
 * to be received and listed.
 */
export type NotificationKind = string;

export type NotificationSnoozePreset =
  | 'ONE_HOUR'
  | 'ONE_DAY'
  | 'SEVEN_DAYS';

export const NOTIFICATION_ICON_KEYS = {
  PERSON: 'person',
  CANDIDATE_IMPORT: 'candidate-import',
  CANDIDATE_INSUFFICIENCY: 'candidate-insufficiency',
  SUPPORT_CHAT: 'support-chat',
  SUPPORT_OVERDUE: 'support-overdue',
  WALLET_SUCCESS: 'wallet-success',
  WALLET_WARNING: 'wallet-warning',
  WALLET_ERROR: 'wallet-error',
  VERIFICATION_CHARGE: 'verification-charge',
  SYSTEM_INFO: 'system-info',
  INVOICE: 'invoice',
} as const;

export type NotificationIconKey =
  (typeof NOTIFICATION_ICON_KEYS)[keyof typeof NOTIFICATION_ICON_KEYS];

export const NOTIFICATION_CATEGORIES = {
  CANDIDATE: 'candidate',
  BILLING: 'billing',
  SUPPORT: 'support',
  VERIFICATION: 'verification',
  SYSTEM: 'system',
} as const;

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

export const NOTIFICATION_SUBJECT_TYPES = {
  CANDIDATE: 'candidate',
  CLIENT_USER: 'client-user',
  INTERNAL_USER: 'internal-user',
  ORGANIZATION: 'organization',
} as const;

export type NotificationSubjectType =
  (typeof NOTIFICATION_SUBJECT_TYPES)[keyof typeof NOTIFICATION_SUBJECT_TYPES];

export interface NotificationSubject {
  type: NotificationSubjectType;
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface NotificationPresentation {
  iconKey: NotificationIconKey;
  category: NotificationCategory;
}

export interface NotificationListItem {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  state: NotificationState;
  titleMarkdown: string;
  bodyMarkdown: string;
  navigationHref: string | null;
  metadata: Record<string, unknown> | null;
  presentation: NotificationPresentation;
  createdAt: string;
  deliveredAt: string;
  readAt: string | null;
  snoozedUntil: string | null;
}

export interface NotificationListResponse {
  items: NotificationListItem[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationUnreadCountResponse {
  unreadCount: number;
  latestCreatedAt: string | null;
}

export interface NotificationMutationResponse {
  item: NotificationListItem;
  unreadCount: number;
}

export interface NotificationReadAllResponse {
  unreadCount: number;
}
