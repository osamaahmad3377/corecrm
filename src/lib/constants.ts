export const APP_NAME = "CoreCRM";
export const APP_DESCRIPTION = "IT Support & Client Portal";

export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours
export const INVITATION_TTL_HOURS = 72;
export const PASSWORD_RESET_TTL_MINUTES = 60;

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const ALLOWED_UPLOAD_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/json",
  "application/octet-stream",
  "application/x-ndjson",
  "text/x-log",
] as const;

export const ALLOWED_UPLOAD_EXT = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic",
  ".pdf", ".txt", ".csv", ".log",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip", ".json",
] as const;

export const TICKET_NUMBER_PREFIX = "TKT";

export const STATUS_KEYS = {
  NEW: "NEW",
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  WAITING_FOR_CLIENT: "WAITING_FOR_CLIENT",
  WAITING_FOR_INTERNAL: "WAITING_FOR_INTERNAL",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;

export const PRIORITY_KEYS = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;

export const OPEN_STATUS_KEYS = [
  STATUS_KEYS.NEW,
  STATUS_KEYS.OPEN,
  STATUS_KEYS.IN_PROGRESS,
  STATUS_KEYS.WAITING_FOR_CLIENT,
  STATUS_KEYS.WAITING_FOR_INTERNAL,
];

export const PENDING_STATUS_KEYS = [
  STATUS_KEYS.WAITING_FOR_CLIENT,
  STATUS_KEYS.WAITING_FOR_INTERNAL,
];
