import type {
  ApplicationStatus,
  ApplicationReminderType,
  ApplicationAttachmentKind,
  Interview,
} from "@/types";
import type { Json } from "@/types/database";
import { SuggestionRepository, type SuggestionListItem } from "@/repositories/SuggestionRepository";
import { CalendarRepository } from "@/repositories/CalendarRepository";
import { ApplicationRepository } from "@/repositories/ApplicationRepository";
import type { SuggestionFilter } from "@/features/gmail/types";
import { applicationService } from "@/services/ApplicationService";
import { interviewService } from "@/services/InterviewService";
import { reminderService } from "@/services/ReminderService";
import { attachmentService } from "@/services/AttachmentService";
import { fetchGmailAttachmentBytes } from "@/server-functions/gmail";

const suggestionRepo = new SuggestionRepository();
const calendarRepo = new CalendarRepository();
const applicationRepo = new ApplicationRepository();

// ── GmailService (Module 9A) ──
//
// Client-facing orchestration for Gmail Intelligence, mirroring
// ApplicationService/InterviewService — thin wrapping over GmailRepository
// AND the existing feature services (ApplicationService/InterviewService/
// ReminderService/AttachmentService), reused exactly as-is per the plan's
// "Gmail never grows a parallel copy of application/interview mutation
// logic" principle. This file runs client-side (ambient RLS-scoped
// Supabase client, a real browser session) — the ONE operation that
// genuinely needs a server-only secret (fetching an email attachment's raw
// bytes from Gmail) is isolated into a single small server function
// (fetchGmailAttachmentBytes) that returns just the bytes; the actual
// Storage upload + DB write below still goes through the normal
// AttachmentService call, unchanged.
//
// "Review → Accept / Edit / Dismiss": accept optionally takes an
// `editedPayload` that REPLACES the suggestion's stored `suggested_payload`
// for this resolution — the UI pre-fills an edit form with the stored
// values and submits whatever the user confirmed/changed. Required fields
// missing from either (e.g. no company/role for a new application, no
// interview date) surface as a validation error asking the user to edit,
// never a silent best-guess.

export type ResolveDecision =
  { action: "dismiss" } | { action: "accept"; accessToken: string; editedPayload?: Json };

export type ResolveResult = { ok: true } | { ok: false; message: string };

function asRecord(value: Json | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * State shared across one bulk run.
 *
 * Without it, selecting every suggestion for a company and hitting "Accept
 * Selected" creates one application per suggestion — the confirmation email
 * and the recruiter's reply each produce their own. Remembering what this
 * run already created lets later items in the same batch attach to it
 * instead, which is what "one application, one timeline" requires at accept
 * time (the sync-side guard only dedupes suggestions, not accepts).
 */
type BatchContext = {
  /** `company|role` (normalised) → id of the application created in this run. */
  createdApplicationIds: Map<string, string>;
};

function applicationKey(companyName: string, role: string): string {
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(companyName)}|${norm(role)}`;
}

async function acceptCreateApplication(
  userId: string,
  suggestionId: string,
  payload: Record<string, unknown>,
  batch?: BatchContext,
): Promise<{ targetApplicationId: string }> {
  const companyName = typeof payload.companyName === "string" ? payload.companyName.trim() : "";
  // Role is best-effort: recruiting mail frequently never names the title in
  // a machine-readable way. It used to be a hard requirement here, which —
  // combined with the pipeline never extracting a role at all — made EVERY
  // create_application accept fail ("Company and role are required") and left
  // the Review dialog's Accept button permanently disabled. A missing role is
  // now recorded as "Role not specified" (visible and editable on the
  // application afterwards) rather than blocking the action; the company,
  // which we can nearly always resolve, stays required.
  const rawRole = typeof payload.role === "string" ? payload.role.trim() : "";
  const role = rawRole || "Role not specified";
  if (!companyName) {
    throw new Error("A company name is required — edit this suggestion before accepting.");
  }
  // Reuse an application this same bulk run already created for the identical
  // company+role, rather than creating a second one.
  const key = applicationKey(companyName, role);
  const alreadyCreated = batch?.createdApplicationIds.get(key);
  if (alreadyCreated) return { targetApplicationId: alreadyCreated };

  const status = (
    typeof payload.status === "string" ? payload.status : "applied"
  ) as ApplicationStatus;
  const app = await applicationService.createManual(
    userId,
    { company_name: companyName, role, status },
    { createdVia: "gmail", sourceSuggestionId: suggestionId },
  );
  batch?.createdApplicationIds.set(key, app.id);
  return { targetApplicationId: app.id };
}

async function acceptUpdateApplication(
  targetApplicationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const status = payload.status as ApplicationStatus | undefined;
  if (!status) throw new Error("A status is required — edit this suggestion before accepting.");
  await applicationService.updateStatus(targetApplicationId, status);
}

/** manual→X, X→X, the-other-one→both, both stays both. */
function upgradeInterviewSource(
  current: string,
  incoming: "gmail" | "calendar",
): "manual" | "gmail" | "calendar" | "both" {
  if (current === "both" || current === incoming) return current as "both" | "gmail" | "calendar";
  if (current === "manual") return incoming;
  return "both";
}

// A day-before and an hour-before nudge — Q56's "in-app reminders only"
// scope (no push/email notification system), so these just populate the
// existing Reminders surface. Deliberately only fires when accepting a
// suggestion CREATES a new interview, not on every subsequent update to an
// already-linked one (a reschedule-conflict accept, or a silent calendar
// sync) — application_reminders has no interview-round scoping on an
// application-linked row, so re-deriving reminders on every update risks
// touching a different round's reminders sharing the same application_id.
const REMINDER_OFFSET_HOURS: { hours: number; label: string }[] = [
  { hours: 24, label: "1 day" },
  { hours: 1, label: "1 hour" },
];

async function createInterviewReminders(
  userId: string,
  owner: { applicationId: string } | { interviewId: string },
  scheduledAtIso: string,
  companyName: string,
  suggestionId: string,
): Promise<void> {
  const scheduledAt = new Date(scheduledAtIso).getTime();
  const now = Date.now();
  for (const { hours, label } of REMINDER_OFFSET_HOURS) {
    const remindAt = scheduledAt - hours * 60 * 60 * 1000;
    // Skip any offset already in the past — no point reminding about
    // something that should have already happened.
    if (remindAt <= now) continue;
    const input = {
      type: "interview" as const,
      title: `Interview with ${companyName} in ${label}`,
      remind_at: new Date(remindAt).toISOString(),
      source_suggestion_id: suggestionId,
    };
    // A standalone interview has no application to hang the reminder off —
    // application_reminders.interview_id (Module 9B) is exactly that case.
    if ("applicationId" in owner) {
      await reminderService.createReminder(userId, owner.applicationId, input);
    } else {
      await reminderService.createReminderForInterview(userId, owner.interviewId, input);
    }
  }
}

async function acceptCreateInterview(
  userId: string,
  targetApplicationId: string | null,
  suggestionId: string,
  payload: Record<string, unknown>,
  source: "gmail" | "calendar",
): Promise<void> {
  const scheduledAtIso = payload.scheduledAtIso as string | undefined;
  if (!scheduledAtIso) {
    throw new Error(
      "An interview date and time are required — edit this suggestion before accepting.",
    );
  }
  const companyName =
    typeof payload.companyName === "string" && payload.companyName.trim()
      ? payload.companyName.trim()
      : null;
  const mode: "online" | "offline" = payload.mode === "offline" ? "offline" : "online";
  const round =
    typeof payload.round === "string" && payload.round.trim() ? payload.round.trim() : "Interview";
  const existingInterviewId = payload.existingInterviewId as string | null | undefined;
  // Set only for a calendar-sourced draft (see CalendarSuggestionBuilder) —
  // links the resulting interview back to the calendar_events row it came
  // from, the same way accepting a Gmail suggestion sets source_suggestion_id.
  const calendarEventId = (payload.calendarEventId as string | null | undefined) ?? undefined;

  if (existingInterviewId) {
    const current = await interviewService.getInterview(existingInterviewId);
    const timeChanged = current ? current.scheduled_at !== scheduledAtIso : false;
    // First time this calendar event is confirmed as THIS interview vs a
    // drift on an already-confirmed link — same event, different timeline
    // wording, and only the "first link" case sets calendar_events.
    // matched_interview_id (see below) since it was never set before.
    const isNewLink = Boolean(calendarEventId) && current?.calendar_event_id !== calendarEventId;

    await interviewService.updateInterview(existingInterviewId, {
      scheduled_at: scheduledAtIso,
      mode,
      link:
        mode === "online" ? ((payload.link ?? payload.meetingLink ?? null) as string | null) : null,
      location: mode === "offline" ? ((payload.location as string | null) ?? null) : null,
      interviewer: (payload.interviewer as string | null) ?? null,
      source_suggestion_id: suggestionId,
      source: current ? upgradeInterviewSource(current.source, source) : source,
      ...(calendarEventId
        ? { calendar_event_id: calendarEventId, last_calendar_sync_at: new Date().toISOString() }
        : {}),
    });

    if (calendarEventId && source === "calendar") {
      // calendar_events.matched_interview_id is the sync engine's own
      // "already linked" signal (see CalendarSyncService) — it's only ever
      // set here, at explicit accept, never silently during a sync. This is
      // what makes re-syncing the same event afterward recognize it as an
      // update to THIS interview instead of proposing a duplicate.
      await calendarRepo.linkToInterview(calendarEventId, existingInterviewId);
    }

    if (current?.application_id) {
      await applicationRepo.logActivity(
        userId,
        current.application_id,
        isNewLink ? "calendar_event_linked" : "interview_rescheduled",
        isNewLink
          ? "Interview linked to a calendar event"
          : timeChanged
            ? "Interview time updated from your calendar"
            : "Interview details updated from your calendar",
        { calendar_event_id: calendarEventId ?? null },
      );
    }
    return;
  }

  const sharedInput = {
    round,
    scheduled_at: scheduledAtIso,
    mode,
    link:
      mode === "online"
        ? ((payload.link ?? payload.meetingLink ?? null) as string | null)
        : undefined,
    location: mode === "offline" ? ((payload.location as string | null) ?? undefined) : undefined,
    interviewer: (payload.interviewer as string | null) ?? undefined,
    resume_id: (payload.resumeId as string | null) ?? undefined,
  };
  const creationOptions = { sourceSuggestionId: suggestionId, source, calendarEventId };

  // No application to hang this off — a calendar-detected interview at a
  // company the user isn't tracking yet. That's a real interview, not an
  // error: create it standalone rather than refusing (which is what the old
  // "No application linked to this suggestion" guard did, making every
  // unmatched calendar detection un-acceptable).
  let created: Interview;
  if (targetApplicationId) {
    created = await interviewService.scheduleForApplication(
      userId,
      targetApplicationId,
      sharedInput,
      creationOptions,
    );
  } else {
    // A standalone interview has no application to inherit a company from,
    // so the payload must carry one. Surfaced as a message (not a crash)
    // because the caller turns ok:false into "open the Review dialog on
    // this suggestion", which is exactly where the user fixes it — same
    // path a missing date/time already takes.
    if (!companyName) {
      throw new Error(
        "A company name is required for this interview — edit this suggestion before accepting.",
      );
    }
    created = await interviewService.createStandalone(
      userId,
      {
        ...sharedInput,
        company_name: companyName,
        role: (payload.role as string | null)?.trim() || round,
      },
      creationOptions,
    );
  }

  if (calendarEventId && source === "calendar") {
    // Same "only ever set at explicit accept" back-reference as the
    // existingInterviewId branch above — without it, a later sync's merge
    // ladder has no exact rung to promote this event on (no iCalUID, often
    // no meeting link either), so a genuine future reschedule would fall
    // back to a weaker "possible duplicate, confirm merge" suggestion
    // instead of the intended "this interview's details changed" update.
    // Live-verified gap: brand-new calendar-sourced interviews never got
    // this call; only the existingInterviewId (already-known-interview)
    // path did.
    await calendarRepo.linkToInterview(calendarEventId, created.id);
  }

  try {
    await createInterviewReminders(
      userId,
      targetApplicationId ? { applicationId: targetApplicationId } : { interviewId: created.id },
      created.scheduled_at,
      created.company_name,
      suggestionId,
    );
  } catch (err) {
    // The interview itself was created successfully above — a reminder
    // failure is a nice-to-have miss, not grounds to report the whole
    // accept as failed (the caller's try/catch would otherwise turn this
    // into a false "accept failed" for a suggestion that actually succeeded).
    console.error(
      "Failed to create interview reminders:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function acceptAddReminder(
  userId: string,
  targetApplicationId: string,
  suggestionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const remindAtIso = payload.remindAtIso as string | undefined;
  if (!remindAtIso)
    throw new Error("A reminder date is required — edit this suggestion before accepting.");
  const title =
    typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Reminder";
  const reminderType = (
    typeof payload.reminderType === "string" ? payload.reminderType : "follow_up"
  ) as ApplicationReminderType;

  await reminderService.createReminder(userId, targetApplicationId, {
    type: reminderType,
    title,
    remind_at: remindAtIso,
    source_suggestion_id: suggestionId,
  });
}

type PendingAttachment = {
  gmailAttachmentId: string;
  filename: string;
  mimeType: string;
  kind: string;
};

/**
 * Maps the DETECTED attachment kind (a richer vocabulary used for display —
 * resume, portfolio, job_description, calendar_invite…) onto the four kinds
 * `application_attachments.kind` actually permits.
 *
 * Written as an explicit total mapping rather than the previous
 * "keep it if it happens to be one of three values, else other" check: that
 * silently swallowed every newly-detected kind, so a detected offer letter
 * and a detected calendar invite were equally "other" with nothing recording
 * that a decision had been made. Anything with no meaningful home falls back
 * to the file's own MIME type before "other".
 */
function toAttachmentKind(detected: string, mimeType: string): ApplicationAttachmentKind {
  switch (detected) {
    case "offer_letter":
      return "offer_letter";
    case "assignment":
      return "assignment";
    case "pdf":
      return "pdf";
    // No dedicated slot exists for these on an application — resumes belong
    // to the résumé system, and the rest are reference material. Preserve
    // PDF-ness where we can so the attachment list still renders usefully.
    case "resume":
    case "portfolio":
    case "job_description":
    case "calendar_invite":
    default:
      return mimeType === "application/pdf" ? "pdf" : "other";
  }
}

async function acceptImportAttachment(
  userId: string,
  targetApplicationId: string,
  suggestionId: string,
  gmailMessageRowId: string,
  payload: Record<string, unknown>,
  accessToken: string,
): Promise<void> {
  const attachments = Array.isArray(payload.attachments)
    ? (payload.attachments as PendingAttachment[])
    : [];
  if (attachments.length === 0)
    throw new Error("No attachment selected — edit this suggestion before accepting.");

  for (const attachment of attachments) {
    const result = await fetchGmailAttachmentBytes({
      data: { accessToken, gmailMessageRowId, gmailAttachmentId: attachment.gmailAttachmentId },
    });
    if (!result.ok) throw new Error(result.message);

    const bytes = base64ToBytes(result.base64Data);
    const file = new File([bytes as BlobPart], attachment.filename, { type: attachment.mimeType });
    const kind = toAttachmentKind(attachment.kind, attachment.mimeType);
    await attachmentService.uploadAttachment(
      userId,
      targetApplicationId,
      kind,
      file,
      undefined,
      suggestionId,
    );
  }
}

export class GmailService {
  async listSuggestions(
    userId: string,
    filter: SuggestionFilter,
    companySearch?: string,
    sourceScope?: "gmail" | "calendar",
  ): Promise<SuggestionListItem[]> {
    return suggestionRepo.findSuggestionsByUser(userId, filter, companySearch, sourceScope);
  }

  async getPendingCount(userId: string, sourceScope?: "gmail" | "calendar"): Promise<number> {
    return suggestionRepo.countPendingByUser(userId, sourceScope);
  }

  /**
   * Single suggestion Review → Accept/Edit → Dismiss.
   *
   * TOTAL by contract: always resolves to a ResolveResult, never rejects.
   * That matters because resolveSuggestions below drives bulk actions in a
   * loop — previously `findSuggestionById` and the whole dismiss path sat
   * outside the try/catch, so a single failing item threw straight out of
   * the loop, abandoning every remaining suggestion and surfacing nothing to
   * the user. Per-item error isolation is the whole point of the bulk API,
   * and it only holds if this method cannot throw.
   *
   * `batch` lets a bulk run share state across items — see resolveSuggestions.
   */
  async resolveSuggestion(
    userId: string,
    suggestionId: string,
    decision: ResolveDecision,
    batch?: BatchContext,
  ): Promise<ResolveResult> {
    try {
      const suggestion = await suggestionRepo.findSuggestionById(suggestionId);
      if (!suggestion || suggestion.user_id !== userId) {
        return { ok: false, message: "Suggestion not found." };
      }
      if (suggestion.status !== "pending") {
        return { ok: false, message: "This suggestion has already been resolved." };
      }

      if (decision.action === "dismiss") {
        await suggestionRepo.updateSuggestionResolution(suggestionId, "dismissed");
        return { ok: true };
      }

      const payload = asRecord(decision.editedPayload ?? suggestion.suggested_payload);

      let targetApplicationId = suggestion.target_application_id;

      switch (suggestion.type) {
        case "create_application": {
          const result = await acceptCreateApplication(userId, suggestionId, payload, batch);
          targetApplicationId = result.targetApplicationId;
          break;
        }
        case "update_application": {
          if (!targetApplicationId) throw new Error("No application linked to this suggestion.");
          await acceptUpdateApplication(targetApplicationId, payload);
          break;
        }
        case "create_interview": {
          // An application is NOT required here. Three valid shapes:
          //   - existingInterviewId set → update that interview in place
          //     (e.g. a calendar reschedule review item).
          //   - targetApplicationId set → create linked to that application.
          //   - neither → create a STANDALONE interview from the payload's
          //     own companyName/role (a calendar-detected interview at a
          //     company with no tracked application). This used to throw
          //     "No application linked to this suggestion", which made every
          //     unmatched calendar detection impossible to accept.
          await acceptCreateInterview(
            userId,
            targetApplicationId,
            suggestionId,
            payload,
            suggestion.calendar_event_id ? "calendar" : "gmail",
          );
          break;
        }
        case "add_reminder": {
          if (!targetApplicationId) throw new Error("No application linked to this suggestion.");
          await acceptAddReminder(userId, targetApplicationId, suggestionId, payload);
          break;
        }
        case "import_attachment": {
          if (!targetApplicationId) throw new Error("No application linked to this suggestion.");
          // Calendar events never carry attachments — this type is Gmail-only.
          if (!suggestion.gmail_message_id) {
            throw new Error("No source email linked to this suggestion.");
          }
          await acceptImportAttachment(
            userId,
            targetApplicationId,
            suggestionId,
            suggestion.gmail_message_id,
            payload,
            decision.accessToken,
          );
          break;
        }
      }

      await suggestionRepo.updateSuggestionResolution(suggestionId, "accepted", payload as Json);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to apply this suggestion.",
      };
    }
  }

  /**
   * Bulk "Accept Selected" / "Dismiss Selected" — operates on each
   * suggestion's stored payload as-is (no per-item edit; a user who wants to
   * adjust fields reviews that one individually instead). Returns a
   * per-item outcome so one failure (e.g. a target application deleted
   * meanwhile) doesn't silently fail the whole batch.
   *
   * Runs sequentially rather than in parallel, for two reasons: several
   * suggestions in one batch can target the SAME application (a status move
   * plus a reminder), and accepting two create_application suggestions for
   * one company must produce one application, not two — both need each item
   * to see the effects of the previous one. The shared `batch` below is what
   * carries that.
   *
   * The per-item try/catch is redundant with resolveSuggestion's own (which
   * is total by contract) and deliberately kept anyway: this loop must
   * survive a future change to that contract, because a throw here silently
   * abandons every remaining suggestion the user selected.
   */
  async resolveSuggestions(
    userId: string,
    suggestionIds: string[],
    action: "accept" | "dismiss",
    accessToken: string,
  ): Promise<{ suggestionId: string; ok: boolean; message?: string }[]> {
    const results: { suggestionId: string; ok: boolean; message?: string }[] = [];
    const batch: BatchContext = { createdApplicationIds: new Map() };

    for (const suggestionId of suggestionIds) {
      const decision: ResolveDecision =
        action === "dismiss" ? { action: "dismiss" } : { action: "accept", accessToken };
      try {
        const result = await this.resolveSuggestion(userId, suggestionId, decision, batch);
        results.push({
          suggestionId,
          ok: result.ok,
          message: result.ok ? undefined : result.message,
        });
      } catch (err) {
        results.push({
          suggestionId,
          ok: false,
          message: err instanceof Error ? err.message : "Failed to apply this suggestion.",
        });
      }
    }
    return results;
  }
}

export const gmailService = new GmailService();
