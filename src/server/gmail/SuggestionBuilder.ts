import type { ApplicationStatus } from "@/types";
import type { Json } from "@/types/database";
import type { GmailMessageCategory, SuggestionType } from "@/features/gmail/types";
import type { ClassificationResult } from "./EmailClassifier";
import type { MatchResult } from "./ApplicationMatcher";
import type { GmailAttachmentRef } from "./GmailApiClient";

// ── Suggestion generation (Module 9A) ──
//
// Maps a classified + matched message onto the 5 action-oriented suggestion
// types. Deliberately table-driven per category rather than one large
// if/else — each category maps to at most one status-changing suggestion
// (create_application XOR update_application, never both) plus, independent
// of category, a separate add_reminder when a deadline was extracted and an
// import_attachment when the message carries real attachments — a single
// email can legitimately warrant more than one suggestion (e.g. an
// assessment invite with both a deadline and an attached instructions PDF).
//
// Every draft carries a structured `summary` block in its payload (company /
// role / recruiter / when / why). That exists because the card UI has to
// answer WHAT-WHO-WHY-WHEN without the user opening anything, and a single
// prose `explanation` string can't be laid out as distinct fields. The
// `explanation` column stays the one-line "why am I seeing this", now
// written per category instead of one generic template — the old
// "We found what looks like a job application update from X" said nothing
// the user couldn't already see.
//
// One suggestion generated here always has the highest visible bar: it must
// have a `target_application_id` (from a *single* match, never ambiguous)
// for anything but create_application, since update_application/
// create_interview/add_reminder/import_attachment all require an existing
// application per the DB schema (application_attachments.application_id is
// NOT NULL).

export type SuggestionDraft = {
  type: SuggestionType;
  confidence: number;
  explanation: string;
  targetApplicationId: string | null;
  payload: Json;
};

const STATUS_BY_CATEGORY: Partial<Record<GmailMessageCategory, ApplicationStatus>> = {
  offer: "offer",
  offer_accepted: "offer",
  rejection: "rejected",
  offer_declined: "rejected",
  online_assessment: "online_assessment",
  oa_invitation: "online_assessment",
  assignment: "online_assessment",
  // Post-offer formalities all imply the offer stage was reached — moving the
  // application there keeps the pipeline honest even if the offer email
  // itself was never synced (e.g. it predates the connection).
  background_verification: "offer",
  reference_check: "offer",
  joining_formalities: "offer",
};

/** Categories that describe an interview whose date we should capture. Exported (Module 9B) — GmailSyncService uses this same set to decide which messages are worth fetching a .ics attachment's UID from. */
export const INTERVIEW_CATEGORIES = new Set<GmailMessageCategory>([
  "interview_invitation",
  "interview_scheduled",
  "interview_rescheduled",
]);

/** Categories that carry an assessment deadline worth a reminder. */
const ASSESSMENT_CATEGORIES = new Set<GmailMessageCategory>([
  "online_assessment",
  "oa_invitation",
  "assignment",
]);

// Categories worth suggesting a brand-new application for when nothing
// matched — a bare "recruiter_reply"/"follow_up_required"/"application_update"
// with no company context and no existing match is too thin a signal to be
// worth a suggestion at all.
const CREATE_WORTHY_CATEGORIES = new Set<GmailMessageCategory>([
  "application_submitted",
  "application_confirmation",
  "recruiter_reply",
  "interview_invitation",
  "interview_scheduled",
  "interview_rescheduled",
  "oa_invitation",
  "online_assessment",
  "assignment",
  "offer",
  "rejection",
  "waitlist",
]);

/** Card headline — the WHAT, in the user's language. */
const CATEGORY_HEADLINE: Record<GmailMessageCategory, string> = {
  application_submitted: "Application Submitted",
  application_confirmation: "Application Confirmation",
  recruiter_viewed: "Recruiter Viewed",
  recruiter_reply: "Recruiter Reply",
  application_update: "Application Update",
  oa_invitation: "OA Invitation",
  online_assessment: "Assessment",
  assignment: "Assignment",
  interview_invitation: "Interview Invitation",
  interview_scheduled: "Interview Scheduled",
  interview_rescheduled: "Interview Rescheduled",
  interview_reminder: "Interview Reminder",
  offer: "Offer",
  offer_accepted: "Offer Accepted",
  offer_declined: "Offer Declined",
  waitlist: "Waitlist",
  rejection: "Rejected",
  background_verification: "Background Verification",
  reference_check: "Reference Check",
  joining_formalities: "Joining Formalities",
  follow_up_required: "Follow-up Required",
  general_recruiter_communication: "Recruiter Communication",
  unknown: "Unknown",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function attachmentKind(category: GmailMessageCategory, attachment: GmailAttachmentRef): string {
  const name = attachment.filename.toLowerCase();
  if (name.endsWith(".ics") || attachment.mimeType === "text/calendar") return "calendar_invite";
  if (/\b(?:resume|cv)\b/.test(name)) return "resume";
  if (/portfolio/.test(name)) return "portfolio";
  if (/\b(?:offer|loi|letter)\b/.test(name) || category === "offer") return "offer_letter";
  if (/\b(?:assignment|task|challenge|problem)\b/.test(name) || category === "assignment")
    return "assignment";
  if (/\b(?:jd|job[-_ ]?description)\b/.test(name)) return "job_description";
  if (attachment.mimeType === "application/pdf") return "pdf";
  return "other";
}

// ── The "why" line, written per category ──
//
// Each reads as a statement about THIS email, using the entities actually
// extracted, so the user can act on the card without opening anything.
function reasonFor(input: {
  category: GmailMessageCategory;
  company: string | null;
  role: string | null;
  recruiter: string | null;
  scheduledAtIso: string | null;
  assessmentPlatform: string | null;
}): string {
  const { category, company, role, recruiter, scheduledAtIso, assessmentPlatform } = input;
  const who = recruiter ?? (company ? `${company}'s team` : "The sender");
  const at = company ? ` at ${company}` : "";
  const forRole = role ? ` for ${role}` : "";
  const when = formatDate(scheduledAtIso);

  switch (category) {
    case "interview_invitation":
      return when
        ? `${who} invited you to interview${forRole} on ${when}.`
        : `${who} invited you to interview${forRole}. The date wasn't stated clearly — confirm it below.`;
    case "interview_scheduled":
      return when
        ? `Your interview${forRole}${at} is confirmed for ${when}.`
        : `Your interview${forRole}${at} is confirmed.`;
    case "interview_rescheduled":
      return when
        ? `Your interview${forRole}${at} moved to ${when}.`
        : `Your interview${forRole}${at} was rescheduled — confirm the new time.`;
    case "interview_reminder":
      return when
        ? `Reminder: your interview${forRole}${at} is on ${when}.`
        : `Reminder about your upcoming interview${forRole}${at}.`;
    case "oa_invitation":
      return assessmentPlatform
        ? `${who} invited you to a ${assessmentPlatform} assessment${forRole}${when ? `, due ${when}` : ""}.`
        : `${who} invited you to an online assessment${forRole}${when ? `, due ${when}` : ""}.`;
    case "online_assessment":
      return assessmentPlatform
        ? `${who} sent a ${assessmentPlatform} assessment${forRole}${when ? `, due ${when}` : ""}.`
        : `${who} sent an online assessment${forRole}${when ? `, due ${when}` : ""}.`;
    case "assignment":
      return `${who} sent a take-home assignment${forRole}${when ? `, due ${when}` : ""}.`;
    case "offer":
      return `${who} extended an offer${forRole}${at}.`;
    case "offer_accepted":
      return `Your acceptance of the offer${forRole}${at} was confirmed.`;
    case "offer_declined":
      return `The offer${forRole}${at} was declined.`;
    case "waitlist":
      return `${company ?? "The company"} placed your application${forRole} on a waitlist.`;
    case "rejection":
      return role
        ? `${company ?? "The company"} is not moving forward with your ${role} application.`
        : `${company ?? "The company"} is not moving forward with your application.`;
    case "application_submitted":
      return `You submitted an application${forRole}${at}.`;
    case "application_confirmation":
      return `Your application${forRole}${at} was received.`;
    case "recruiter_viewed":
      return `${who} viewed your application${forRole}.`;
    case "recruiter_reply":
      return `${who} replied about your application${forRole}.`;
    case "background_verification":
      return `${who} started background verification${forRole}${at}.`;
    case "reference_check":
      return `${who} requested references${forRole}${at}.`;
    case "joining_formalities":
      return `${who} sent joining formalities${forRole}${at}${when ? ` — due ${when}` : ""}.`;
    case "follow_up_required":
      return `${who} is waiting on a response from you${forRole}.`;
    case "application_update":
      return `The status of your application${forRole}${at} changed.`;
    case "general_recruiter_communication":
      return `${who} sent an update about your application${forRole}.`;
    case "unknown":
      return "This email looks job-related but couldn't be classified confidently.";
  }
}

/**
 * What the user actually has to DO about this email, or null when the email
 * is purely informational.
 *
 * Separate from the "why" line on purpose: a summary that only describes what
 * happened still leaves the user to work out whether it needs them. Stating
 * the action explicitly — and stating nothing when there ISN'T one — is what
 * makes the card scannable, so "Offer accepted, confirmed" doesn't read with
 * the same urgency as "Choose an interview slot before Friday".
 */
function actionFor(input: {
  category: GmailMessageCategory;
  scheduledAtIso: string | null;
  hasMeetingLink: boolean;
}): string | null {
  const { category, scheduledAtIso, hasMeetingLink } = input;
  const by = formatDay(scheduledAtIso);

  switch (category) {
    case "interview_invitation":
      return hasMeetingLink
        ? "Confirm your attendance and add this to your calendar."
        : by
          ? `Confirm your availability before ${by}.`
          : "Reply with your availability to get this scheduled.";
    case "interview_scheduled":
      return "Add this to your calendar and prepare.";
    case "interview_rescheduled":
      return "Update your calendar with the new time.";
    case "interview_reminder":
      return by ? `Be ready on ${by}.` : "Be ready — this is coming up.";
    case "oa_invitation":
    case "online_assessment":
      return by ? `Complete the assessment before ${by}.` : "Complete the assessment.";
    case "assignment":
      return by ? `Submit the assignment before ${by}.` : "Complete and submit the assignment.";
    case "offer":
      return by ? `Accept or decline before ${by}.` : "Review the offer and respond.";
    case "waitlist":
      return "No action needed — you'll hear back if a place opens up.";
    case "follow_up_required":
      return by ? `Respond before ${by}.` : "Respond to keep this moving.";
    case "background_verification":
    case "reference_check":
      return "Provide the requested details.";
    case "joining_formalities":
      return by ? `Complete the paperwork before ${by}.` : "Complete the joining paperwork.";
    // Purely informational — deliberately no action line.
    case "application_submitted":
    case "application_confirmation":
    case "recruiter_viewed":
    case "recruiter_reply":
    case "application_update":
    case "offer_accepted":
    case "offer_declined":
    case "rejection":
    case "general_recruiter_communication":
    case "unknown":
      return null;
  }
}

/**
 * The human-readable evidence behind the confidence score, rendered as a
 * "Detected because" checklist under the tier. Each line names the actual
 * value found ("Company identified: Groww") rather than the bare fact that
 * something was found — a checklist the user can verify against the email is
 * what makes the score trustworthy; "Medium confidence" alone is just a
 * verdict they have to take on faith.
 */
function confidenceReasons(input: {
  category: GmailMessageCategory;
  company: string | null;
  role: string | null;
  recruiter: string | null;
  match: MatchResult;
  assessmentPlatform: string | null;
  hasIcsAttachment: boolean;
  meetingLink: string | null;
  onKnownAtsDomain: boolean;
}): string[] {
  const reasons: string[] = [];

  if (input.company) reasons.push(`Company identified: ${input.company}`);
  if (input.role) reasons.push(`Role identified: ${input.role}`);
  if (input.recruiter) reasons.push(`Recruiter identified: ${input.recruiter}`);

  if (input.match.kind === "single") reasons.push("Thread matches an existing application");
  else if (input.match.kind === "ambiguous") {
    reasons.push(`Matches ${input.match.candidateApplicationIds.length} possible applications`);
  }

  if (INTERVIEW_CATEGORIES.has(input.category) || input.category === "interview_reminder") {
    reasons.push("Interview keywords detected");
  } else if (ASSESSMENT_CATEGORIES.has(input.category)) {
    reasons.push("Assessment keywords detected");
  } else if (input.category === "offer" || input.category === "offer_accepted") {
    reasons.push("Offer language detected");
  } else if (input.category === "rejection" || input.category === "offer_declined") {
    reasons.push("Rejection language detected");
  } else if (input.category === "recruiter_reply") {
    reasons.push("Recruiter replied");
  } else if (
    input.category === "background_verification" ||
    input.category === "reference_check" ||
    input.category === "joining_formalities"
  ) {
    reasons.push("Post-offer formalities detected");
  }

  if (input.assessmentPlatform) reasons.push(`Assessment platform: ${input.assessmentPlatform}`);
  if (input.hasIcsAttachment) reasons.push("Calendar invite attached");
  else if (input.meetingLink) reasons.push("Scheduling link found");
  if (input.onKnownAtsDomain) reasons.push("Sent from a known ATS");

  if (reasons.length === 0) reasons.push("Matched hiring keywords only");
  return reasons;
}

export function buildSuggestions(input: {
  classification: ClassificationResult;
  match: MatchResult;
  companyName: string | null;
  role: string | null;
  recruiterName: string | null;
  receivedAtIso: string;
  subject: string | null;
  attachments: GmailAttachmentRef[];
  /** Whether the sender is a recognised ATS/assessment platform — evidence for the confidence checklist. */
  onKnownAtsDomain: boolean;
}): SuggestionDraft[] {
  const {
    classification,
    match,
    companyName,
    role,
    recruiterName,
    receivedAtIso,
    subject,
    attachments,
  } = input;
  const { category, confidence, extracted } = classification;
  if (category === "unknown") return [];

  const drafts: SuggestionDraft[] = [];

  const reason = reasonFor({
    category,
    company: companyName,
    role,
    recruiter: recruiterName,
    scheduledAtIso: extracted.scheduledAtIso,
    assessmentPlatform: extracted.assessmentPlatform,
  });

  const reasons = confidenceReasons({
    category,
    company: companyName,
    role,
    recruiter: recruiterName,
    match,
    assessmentPlatform: extracted.assessmentPlatform,
    hasIcsAttachment: extracted.hasIcsAttachment,
    meetingLink: extracted.meetingLink,
    onKnownAtsDomain: input.onKnownAtsDomain,
  });

  const action = actionFor({
    category,
    scheduledAtIso: extracted.scheduledAtIso,
    hasMeetingLink: Boolean(extracted.meetingLink),
  });

  /** The structured WHAT/WHO/WHY/WHEN/ACTION block every card renders. */
  const summary = {
    headline: CATEGORY_HEADLINE[category],
    company: companyName,
    role,
    recruiter: recruiterName,
    receivedAtIso,
    reason,
    action,
    confidenceReasons: reasons,
    subject,
  };

  // ── No match at all: only a create_application suggestion is possible,
  // and only for categories where a brand-new application is plausible. ──
  if (match.kind === "none") {
    if (CREATE_WORTHY_CATEGORIES.has(category)) {
      drafts.push({
        type: "create_application",
        confidence,
        explanation: reason,
        targetApplicationId: null,
        payload: {
          companyName,
          role,
          status: STATUS_BY_CATEGORY[category] ?? "applied",
          subject,
          summary,
        },
      });
    }
    return drafts;
  }

  // ── Ambiguous match: surface a create_application-shaped suggestion
  // carrying the candidate set, so the user disambiguates at accept-time
  // rather than the matcher guessing. ──
  if (match.kind === "ambiguous") {
    drafts.push({
      type: "create_application",
      confidence: confidence * 0.7,
      explanation: `${reason} ${match.reason}`,
      targetApplicationId: null,
      payload: {
        companyName,
        role,
        status: STATUS_BY_CATEGORY[category] ?? "applied",
        subject,
        candidateApplicationIds: match.candidateApplicationIds,
        summary: { ...summary, reason: `${reason} ${match.reason}` },
      },
    });
    return drafts;
  }

  // ── Single confident match ──
  const targetApplicationId = match.applicationId;
  const combinedConfidence = Math.min(confidence, match.confidence);

  const targetStatus = STATUS_BY_CATEGORY[category];
  if (targetStatus) {
    drafts.push({
      type: "update_application",
      confidence: combinedConfidence,
      explanation: reason,
      targetApplicationId,
      payload: { status: targetStatus, summary },
    });
  }

  if (INTERVIEW_CATEGORIES.has(category)) {
    drafts.push({
      type: "create_interview",
      confidence: combinedConfidence,
      explanation: reason,
      targetApplicationId,
      payload: {
        scheduledAtIso: extracted.scheduledAtIso,
        timezoneConfident: extracted.timezoneConfident,
        rawDateText: extracted.rawDateText,
        meetingLink: extracted.meetingLink,
        round: role ? `Interview — ${role}` : "Interview",
        interviewer: recruiterName,
        existingInterviewId: null,
        summary,
      },
    });
  }

  if (category === "follow_up_required") {
    drafts.push({
      type: "add_reminder",
      confidence: combinedConfidence,
      explanation: reason,
      targetApplicationId,
      payload: {
        reminderType: "follow_up",
        title: companyName ? `Follow up with ${companyName}` : "Follow up",
        remindAtIso: extracted.scheduledAtIso,
        summary,
      },
    });
  }

  if (ASSESSMENT_CATEGORIES.has(category) && extracted.scheduledAtIso) {
    const due = formatDay(extracted.scheduledAtIso);
    drafts.push({
      type: "add_reminder",
      confidence: combinedConfidence,
      explanation: due ? `${reason} Complete before ${due}.` : reason,
      targetApplicationId,
      payload: {
        reminderType: "oa_deadline",
        title: extracted.assessmentPlatform
          ? `${extracted.assessmentPlatform} deadline${companyName ? ` — ${companyName}` : ""}`
          : `Assessment deadline${companyName ? ` — ${companyName}` : ""}`,
        remindAtIso: extracted.scheduledAtIso,
        summary,
      },
    });
  }

  if (attachments.length > 0) {
    const named = attachments.map((a) => a.filename).join(", ");
    drafts.push({
      type: "import_attachment",
      confidence: combinedConfidence,
      explanation:
        attachments.length === 1
          ? `${companyName ?? "This email"} sent an attachment: ${named}.`
          : `${companyName ?? "This email"} sent ${attachments.length} attachments: ${named}.`,
      targetApplicationId,
      payload: {
        attachments: attachments.map((a) => ({
          gmailAttachmentId: a.attachmentId,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          kind: attachmentKind(category, a),
        })),
        summary,
      },
    });
  }

  return drafts;
}
