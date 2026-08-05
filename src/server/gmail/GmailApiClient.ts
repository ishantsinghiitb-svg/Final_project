// ── Gmail REST API client (Module 9A) ──
//
// Hand-rolled `fetch` against Gmail's REST API — see GoogleOAuthClient.ts for
// why no `googleapis` dependency. Every call goes through `gmailFetch`, which
// retries 429/5xx responses with exponential backoff + jitter (mirrors
// src/server/ai/retry.ts's shape) and honors Gmail's `Retry-After` header
// when present rather than guessing — that module isn't reused directly
// since it's coupled to AIError, a different domain's error hierarchy.

import { base64UrlDecode } from "./base64";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GmailApiError";
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

async function gmailFetch(
  path: string,
  accessToken: string,
  params?: URLSearchParams,
  retryOpts: RetryOptions = {},
): Promise<Response> {
  const opts = { ...RETRY_DEFAULTS, ...retryOpts };
  const url = params ? `${GMAIL_API_BASE}${path}?${params.toString()}` : `${GMAIL_API_BASE}${path}`;

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

async function toApiError(response: Response): Promise<GmailApiError> {
  const body = await response.text();
  return new GmailApiError(
    response.status,
    `Gmail API request failed (${response.status}): ${body}`,
  );
}

// ── Profile ──

export type GmailProfile = { emailAddress: string; historyId: string };

/** `users.getProfile` — also the source of the initial historyId checkpoint for a fresh connection. */
export async function getProfile(accessToken: string): Promise<GmailProfile> {
  const response = await gmailFetch("/profile", accessToken);
  if (!response.ok) throw await toApiError(response);
  const data = (await response.json()) as { emailAddress: string; historyId: string };
  return { emailAddress: data.emailAddress, historyId: data.historyId };
}

// ── messages.list (bounded initial fetch) ──

export type GmailMessageRef = { id: string; threadId: string };
export type ListMessagesResult = { messages: GmailMessageRef[]; nextPageToken: string | null };

/** `messages.list` with a search query — the bound on what's ever fetched at all (see RelevanceFilter.buildSyncQuery). */
export async function listMessages(
  accessToken: string,
  query: string,
  options: { pageToken?: string; maxResults?: number } = {},
): Promise<ListMessagesResult> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(options.maxResults ?? 50),
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const response = await gmailFetch("/messages", accessToken, params);
  if (!response.ok) throw await toApiError(response);
  const data = (await response.json()) as { messages?: GmailMessageRef[]; nextPageToken?: string };
  return { messages: data.messages ?? [], nextPageToken: data.nextPageToken ?? null };
}

// ── history.list (incremental fetch after the first sync) ──

export type ListHistoryResult = {
  /** New message ids since `startHistoryId` — de-duplicated, no query filter applied by Gmail itself (re-apply RelevanceFilter before fetching full content). */
  messageIds: string[];
  nextPageToken: string | null;
  historyId: string;
};

/** `history.list`, filtered to `messagesAdded` only (read-state/label changes aren't relevant here). */
export async function listHistory(
  accessToken: string,
  startHistoryId: string,
  pageToken?: string,
): Promise<ListHistoryResult> {
  const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
  if (pageToken) params.set("pageToken", pageToken);

  const response = await gmailFetch("/history", accessToken, params);
  if (!response.ok) throw await toApiError(response);
  const data = (await response.json()) as {
    history?: { messagesAdded?: { message: GmailMessageRef }[] }[];
    nextPageToken?: string;
    historyId: string;
  };

  const ids = new Set<string>();
  for (const entry of data.history ?? []) {
    for (const added of entry.messagesAdded ?? []) ids.add(added.message.id);
  }
  return {
    messageIds: [...ids],
    nextPageToken: data.nextPageToken ?? null,
    historyId: data.historyId,
  };
}

// ── messages.get (metadata format — cheap first pass) ──

export type GmailMessageMetadata = {
  id: string;
  threadId: string;
  snippet: string;
  /** Epoch milliseconds, as a string (Gmail API convention). */
  internalDate: string;
  /** Header names lowercased. */
  headers: Record<string, string>;
  /** e.g. ["INBOX","UNREAD"] — Gmail returns this on every messages.get call regardless of format, at no extra request cost. Not currently used for filtering, only diagnostics. */
  labelIds: string[];
};

const RELEVANCE_HEADERS = [
  "From",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "In-Reply-To",
  "References",
];

/** `messages.get?format=metadata` — headers + snippet only, no body/attachments. The cheap pass RelevanceFilter runs against before any full fetch. */
export async function getMessageMetadata(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageMetadata> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const header of RELEVANCE_HEADERS) params.append("metadataHeaders", header);

  const response = await gmailFetch(`/messages/${messageId}`, accessToken, params);
  if (!response.ok) throw await toApiError(response);
  return parseMetadataResponse(await response.json());
}

function parseMetadataResponse(data: {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
}): GmailMessageMetadata {
  const headers: Record<string, string> = {};
  for (const h of data.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet,
    internalDate: data.internalDate,
    headers,
    labelIds: data.labelIds ?? [],
  };
}

// ── messages.get (full format — for classification's structured extraction) ──

export type GmailAttachmentRef = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type GmailFullMessage = GmailMessageMetadata & {
  /** Plain-text body; falls back to HTML with tags stripped when no text/plain part exists. Never persisted — used transiently during classification only. */
  bodyText: string;
  attachments: GmailAttachmentRef[];
};

type MimePart = {
  mimeType?: string;
  filename?: string;
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: MimePart[];
};

function decodeBase64UrlToUtf8(data: string): string {
  return new TextDecoder().decode(base64UrlDecode(data));
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Walks Gmail's recursive MIME part tree, collecting the best body text and any true attachments (parts with both a filename and an attachmentId — distinct from inline content parts). */
function walkParts(
  part: MimePart,
  ctx: { plainText: string | null; htmlText: string | null; attachments: GmailAttachmentRef[] },
): void {
  const hasFilename = Boolean(part.filename && part.filename.length > 0);
  const attachmentId = part.body?.attachmentId;

  if (hasFilename && attachmentId) {
    ctx.attachments.push({
      attachmentId,
      filename: part.filename as string,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
    });
  } else if (part.mimeType === "text/plain" && part.body?.data && ctx.plainText === null) {
    ctx.plainText = decodeBase64UrlToUtf8(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data && ctx.htmlText === null) {
    ctx.htmlText = decodeBase64UrlToUtf8(part.body.data);
  }

  for (const child of part.parts ?? []) walkParts(child, ctx);
}

/** `messages.get?format=full` — headers + body text + attachment refs (never attachment BYTES — those are fetched separately, and only at suggestion accept-time, see getAttachment). */
export async function getFullMessage(
  accessToken: string,
  messageId: string,
): Promise<GmailFullMessage> {
  const response = await gmailFetch(
    `/messages/${messageId}`,
    accessToken,
    new URLSearchParams({ format: "full" }),
  );
  if (!response.ok) throw await toApiError(response);

  const data = (await response.json()) as {
    id: string;
    threadId: string;
    snippet: string;
    internalDate: string;
    payload?: { headers?: { name: string; value: string }[] } & MimePart;
  };
  const metadata = parseMetadataResponse(data);

  const ctx = {
    plainText: null as string | null,
    htmlText: null as string | null,
    attachments: [] as GmailAttachmentRef[],
  };
  if (data.payload) walkParts(data.payload, ctx);

  const bodyText = ctx.plainText ?? (ctx.htmlText ? stripHtmlTags(ctx.htmlText) : "");
  return { ...metadata, bodyText, attachments: ctx.attachments };
}

// ── attachments.get (accept-time only — see the plan's Attachment Handling section) ──

export type GmailAttachmentData = { data: Uint8Array; size: number };

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<GmailAttachmentData> {
  const response = await gmailFetch(
    `/messages/${messageId}/attachments/${attachmentId}`,
    accessToken,
  );
  if (!response.ok) throw await toApiError(response);
  const data = (await response.json()) as { data: string; size: number };
  return { data: base64UrlDecode(data.data), size: data.size };
}
