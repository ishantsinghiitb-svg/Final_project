// ── Google Calendar REST API client (Module 9B) ──
//
// Hand-rolled `fetch` against Calendar's REST v3 API — same rationale as
// src/server/gmail/GmailApiClient.ts (no `googleapis` dependency, Workers-
// appropriate). Every call goes through `calendarFetch`, which mirrors
// GmailApiClient's `gmailFetch` retry/backoff shape exactly (429/5xx retried
// with exponential backoff + jitter, honoring `Retry-After` when present).
//
// `getPrimaryCalendar` is what the OAuth callback needs to resolve the
// account's email when a user connects Calendar WITHOUT Gmail already
// granted (Gmail's own `users.getProfile` would 403 without the
// gmail.readonly scope) — the Calendar API has no separate "who am I"
// endpoint, but the primary calendar's own `id` field IS the account's email
// address.
//
// `listEvents` covers BOTH of CalendarSyncService's two modes with one
// function: a windowed full sync (`timeMin`/`timeMax` + `pageToken`) and a
// token-based incremental sync (`syncToken` alone, no time window — the
// window was fixed at the full sync that produced the token). This mirrors
// GmailApiClient's `listMessages`/`listHistory` split conceptually, but
// Calendar's API expresses both modes through the same endpoint/response
// shape (`nextPageToken` mid-pagination, `nextSyncToken` once exhausted),
// so one function suffices rather than two.
//
// No MIME/body walking here (unlike Gmail) — the Calendar API returns plain
// JSON with everything already structured (start/end, organizer, attendees,
// conferenceData), which is why this file is simpler than GmailApiClient.ts,
// not more complex.

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export class CalendarApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CalendarApiError";
    this.status = status;
  }
}

type RetryOptions = { attempts?: number; baseDelayMs?: number; maxDelayMs?: number };
const RETRY_DEFAULTS: Required<RetryOptions> = { attempts: 3, baseDelayMs: 500, maxDelayMs: 5000 };

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(response: Response, attempt: number, opts: Required<RetryOptions>): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  const backoff = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
  return backoff + Math.random() * backoff * 0.25;
}

async function calendarFetch(
  path: string,
  accessToken: string,
  params?: URLSearchParams,
  retryOpts: RetryOptions = {},
): Promise<Response> {
  const opts = { ...RETRY_DEFAULTS, ...retryOpts };
  const url = params
    ? `${CALENDAR_API_BASE}${path}?${params.toString()}`
    : `${CALENDAR_API_BASE}${path}`;

  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.ok || !isRetryableStatus(response.status)) return response;
    lastResponse = response;
    if (attempt === opts.attempts - 1) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt, opts)));
  }
  return lastResponse as Response;
}

async function toApiError(response: Response): Promise<CalendarApiError> {
  const body = await response.text();
  return new CalendarApiError(
    response.status,
    `Calendar API request failed (${response.status}): ${body}`,
  );
}

export type PrimaryCalendar = { id: string; timeZone: string };

/** `calendars.get('primary')` — `id` is the account's own email address, the only "who am I" signal the Calendar API offers. */
export async function getPrimaryCalendar(accessToken: string): Promise<PrimaryCalendar> {
  const response = await calendarFetch("/calendars/primary", accessToken);
  if (!response.ok) throw await toApiError(response);
  const data = (await response.json()) as { id: string; timeZone: string };
  return { id: data.id, timeZone: data.timeZone };
}

// ── events.list ──

/** Raw shape of a Calendar API v3 event resource — only the fields this app reads. */
export type GoogleCalendarEvent = {
  id: string;
  iCalUID?: string;
  recurringEventId?: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: {
    email?: string;
    displayName?: string;
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
    self?: boolean;
    organizer?: boolean;
  }[];
  etag?: string;
  updated?: string;
};

export type ListEventsResult = {
  items: GoogleCalendarEvent[];
  /** Present mid-pagination — pass back as `pageToken` to fetch the next page of THIS sync (full or incremental). */
  nextPageToken: string | null;
  /** Present only on the LAST page — the checkpoint for the next incremental sync. Only meaningful once backfill is complete. */
  nextSyncToken: string | null;
};

export type ListEventsParams =
  | {
      /** Windowed full sync — used until backfill completes. */
      mode: "full";
      timeMin: string;
      timeMax: string;
      pageToken?: string;
      maxResults: number;
    }
  | {
      /** Token-based incremental sync — the window is whatever the full sync that produced this token used. */
      mode: "incremental";
      syncToken: string;
      pageToken?: string;
      maxResults: number;
    };

/**
 * `events.list` on a single calendar (`calendarId`, e.g. `'primary'`).
 * `singleEvents=true` always set — instances only, never recurring-series
 * masters (the sync engine needs concrete start times, and treats a
 * high-instance-count series as a standing meeting, not an interview — see
 * CalendarRelevanceFilter). Throws CalendarApiError with status 410 when an
 * incremental sync token has expired/is invalid — the caller must discard it
 * and restart a full sync (this is normal, expected Google API behavior, not
 * a failure to handle specially beyond that).
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  params: ListEventsParams,
): Promise<ListEventsResult> {
  const search = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(params.maxResults),
  });
  if (params.mode === "full") {
    search.set("timeMin", params.timeMin);
    search.set("timeMax", params.timeMax);
  } else {
    search.set("syncToken", params.syncToken);
    // orderBy is invalid together with syncToken per Google's API — an
    // incremental sync returns changes in an unspecified order instead.
    search.delete("orderBy");
  }
  if (params.pageToken) search.set("pageToken", params.pageToken);

  const response = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    accessToken,
    search,
  );
  if (!response.ok) throw await toApiError(response);

  const data = (await response.json()) as {
    items?: GoogleCalendarEvent[];
    nextPageToken?: string;
    nextSyncToken?: string;
  };
  return {
    items: data.items ?? [],
    nextPageToken: data.nextPageToken ?? null,
    nextSyncToken: data.nextSyncToken ?? null,
  };
}
