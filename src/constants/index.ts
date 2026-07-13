// ── Application / Pipeline Status ──
export const APPLICATION_STATUS = {
  INTERESTED: "interested",
  APPLIED: "applied",
  INTERVIEW: "interview",
  OFFER: "offer",
  REJECTED: "rejected",
} as const;

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  interested: "Interested",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Closed",
};

// ── Interview Status ──
export const INTERVIEW_STATUS = {
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ── Employment Type ──
export const EMPLOYMENT_TYPES = {
  FULL_TIME: "full-time",
  PART_TIME: "part-time",
  CONTRACT: "contract",
  INTERNSHIP: "internship",
} as const;

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
};

// ── Work Mode ──
export const WORK_MODES = {
  REMOTE: "remote",
  HYBRID: "hybrid",
  ONSITE: "onsite",
} as const;

export const WORK_MODE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

// ── Experience Levels ──
export const EXPERIENCE_LEVELS = {
  ENTRY: "entry",
  JUNIOR: "junior",
  MID: "mid",
  SENIOR: "senior",
  LEAD: "lead",
  STAFF: "staff",
  PRINCIPAL: "principal",
} as const;

export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  entry: "Entry",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  lead: "Lead",
  staff: "Staff",
  principal: "Principal",
};

// ── Job Sources ──
export const JOB_SOURCES = {
  LINKEDIN: "LinkedIn",
  WELLFOUND: "Wellfound",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  CAREERS: "Careers",
  MANUAL: "Manual",
} as const;

// ── Notification ──
export const NOTIFICATION_TYPES = {
  INTERVIEW_REMINDER: "interview_reminder",
  MATCH: "match",
  OFFER: "offer",
  FOLLOW_UP: "follow_up",
  RESUME: "resume",
  REJECTION: "rejection",
  SYSTEM: "system",
} as const;

export const NOTIFICATION_PRIORITIES = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

// ── Storage Buckets ──
export const STORAGE_BUCKETS = {
  AVATARS: "avatars",
  RESUMES: "resumes",
  DOCUMENTS: "documents",
} as const;

// ── Routes ──
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  SIGNUP: "/signup",
  FORGOT_PASSWORD: "/forgot-password",
  DASHBOARD: "/dashboard",
  DASHBOARD_JOBS: "/dashboard/jobs",
  DASHBOARD_SAVED: "/dashboard/saved",
  DASHBOARD_APPLICATIONS: "/dashboard/applications",
  DASHBOARD_RESUMES: "/dashboard/resumes",
  DASHBOARD_INTERVIEWS: "/dashboard/interviews",
  DASHBOARD_NOTES: "/dashboard/notes",
  DASHBOARD_ANALYTICS: "/dashboard/analytics",
  DASHBOARD_SETTINGS: "/dashboard/settings",
  ABOUT: "/about",
  CONTACT: "/contact",
  FAQ: "/faq",
  FEATURES: "/features",
  PRICING: "/pricing",
} as const;

// ── File Upload Limits ──
export const FILE_LIMITS = {
  AVATAR_MAX_BYTES: 5 * 1024 * 1024,
  RESUME_MAX_BYTES: 10 * 1024 * 1024,
  DOCUMENT_MAX_BYTES: 20 * 1024 * 1024,
} as const;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPTED_RESUME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
