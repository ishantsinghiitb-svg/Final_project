# Module 9B — Calendar Intelligence: Decision Questionnaire

**Status:** pre-implementation. No production code written.
**How to answer:** every question has a ✅ recommended option. Reply with only your
deltas, e.g. `defaults except Q7=B, Q22=C, Q41=A`. Anything you don't mention, I take
the ✅ option and do not ask again.

---

## 1. What I verified in the codebase first

These are facts, not assumptions. They constrain several answers below.

| Area | Current reality |
|---|---|
| Google OAuth | Already exists for Gmail only (`gmail.readonly`), separate from Supabase "Sign in with Google". One row per user in `gmail_connections`, refresh token AES-256-GCM encrypted, stateless HMAC `state`, callback at `src/routes/auth.gmail.callback.ts` (the only service-role write path). |
| **9A is not live** | Per project memory: migrations `20260808000001`, `20260809000001`, `20260810000001` are **not applied** to the live Supabase DB, and no real Google Cloud OAuth client exists yet. Nothing Gmail-related has ever run against production. **This means renames are free right now.** |
| Sync model | Opportunistic only: connect / app-open (once per session) / manual "Sync Now". No cron, no `waitUntil`. Deployed to Cloudflare Workers via Nitro. Claim-lock (`status='syncing'`) + checkpoint-after-persist + 50-message batches. |
| `interviews` table | Has `scheduled_at`, `type` (round), `status`, `mode`, `link`, `location`, `interviewer`, `application_id` (**nullable**, standalone interviews allowed), `resume_id`, `job_id`, `notes`, `source_gmail_suggestion_id`. **No DB CHECK on `status`** — status values are app-level only (`scheduled`/`completed`/`passed`/`rejected`). |
| Suggestions | `gmail_suggestions` with 5 types. `create_interview` payload already carries `existingInterviewId` and `acceptCreateInterview` already **updates** an existing interview when it is set. A merge path exists in skeleton form. |
| ICS today | `EmailClassifier` accepts `icsRawText` and prefers `DTSTART` over prose, but `GmailSyncService` only passes `hasIcsAttachment`. **The .ics body is never downloaded, so `iCalUID` is never captured.** |
| Reminders | `application_reminders` works (types `follow_up`/`interview`/`oa_deadline`/`offer_expiry`/`custom`) but `application_id` is **NOT NULL**, and there is **no delivery mechanism at all** (no cron, no email, no push). Reminders are passive lists. |
| Notification bell | `notifications` table exists but is **completely unused**. The bell in `DashboardShell` renders static mock data from `src/lib/dashboard-data.ts`. |
| Timezones | Nothing is stored anywhere. Everything renders in browser-local time. 9A tracks a `timezoneConfident` boolean and shows a warning when unsure. |
| Analytics (Module 8, frozen) | `AnalyticsService` counts an application as having reached interview stage via `interviews.application_id`. Any new interview status or a flood of calendar-created interviews **changes headline analytics numbers**. |

---

## 2. Questions

### A. Product shape and scope

**Q1. What is the core promise of 9B?**
- ✅ **A)** Read-only intelligence: read Google Calendar, find events that are interviews, merge them with what 9A/manual already created, keep interview times accurate. Nothing is ever written to Google.
- B) Two-way sync: also push NextOffer interviews into Google Calendar, update on reschedule, delete on delete.
- C) Read-only in V1, but build the schema so write-back is a later switch.

*(Recommendation: A, with C's schema hygiene as a free side effect. Write-back means a write scope, real destructive-action risk against the user's real calendar, and Google verification pain. The "get it into my calendar" need is fully served by ICS download, see Q60.)*

**Q2. Does 9B require Gmail (9A) to be connected?**
- ✅ **A)** No. Calendar works standalone; merging with email is a bonus when both are on.
- B) Yes, Calendar is an add-on to the Gmail connection.

**Q3. Is a calendar event allowed to create an interview that is not linked to any application?**
- ✅ **A)** Yes, standalone interview (`application_id` null), with a "Link to application" action available afterwards. `interviews.application_id` is already nullable.
- B) No, only events matching a tracked application become interviews; unmatched ones are ignored.
- C) No interview, but suggest `create_application` + `create_interview` together.

**Q4. Should 9B ever create or update an *application* (not just an interview) from a calendar event?**
- ✅ **A)** Yes, but only as an explicit `create_application` review item when a strong company signal exists and no application matches. Never auto.
- B) No, calendar only ever produces interviews.

**Q5. Should 9B do conflict detection ("this interview overlaps another meeting")?**
- ✅ **A)** Yes, but computed at display time from already-ingested candidate events only. No extra data ingestion.
- B) Yes, using Google's `freebusy` API at display time (sees all busy blocks without storing any private event details). Slightly more API traffic, much better coverage.
- C) No, out of scope.

**Q6. Should 9B surface "interview happened, how did it go?" prompts when a synced event's end time passes?**
- ✅ **A)** Yes, a lightweight outcome prompt on the Interviews page and dashboard for past `scheduled` interviews. Reuses existing status transitions.
- B) No, out of scope for 9B.

### B. Google OAuth, connection, reconnect, disconnect

**Q7. How do the Gmail and Calendar grants relate?** *(This is the single highest-leverage decision here.)*
- ✅ **A) One Google connection, incremental authorization.** Rename `gmail_connections` → `google_connections`, rename the callback route to `/auth/google/callback`, add per-product columns (`gmail_enabled`, `calendar_enabled`, per-product status/checkpoint). Connecting Calendar re-runs consent with `include_granted_scopes=true`, producing one refresh token covering the union. **Free to do right now because 9A has never run in production and no Google client exists yet.** Cost: ~25 mechanical file edits in 9A code.
- B) Keep `gmail_connections` as the physical table name, add `calendar_*` columns. Zero churn, permanently misleading name, and a Calendar-only user lives in a row called "gmail".
- C) Separate `calendar_connections` table with its own token and its own consent screen. Cleanest isolation, two consent prompts, duplicated token/crypto/refresh logic.

**Q8. Which Calendar scope?**
- ✅ **A)** `calendar.events.readonly` only. Sufficient for reading events on the primary calendar. Narrowest possible.
- B) `calendar.readonly` — also allows listing the user's other calendars (required if you ever want the multi-calendar picker in Q11).
- C) `calendar.events` (read/write) — only if Q1=B.

*(If you pick Q11=B or C, this becomes B by necessity.)*

**Q9. Consent copy and trust framing on the connect card:**
- ✅ **A)** Explicit read-only promise, same tone as the existing Gmail card: what is read, what is stored, that nothing is ever created or changed without review, disconnect any time.
- B) Minimal, just the button.

**Q10. Reconnect (`needs_reauth`) behaviour:**
- ✅ **A)** Same as Gmail's: status flips to `needs_reauth` on `invalid_grant`, sync stops, a Reconnect button replaces Disconnect, a banner appears on Interviews and Inbox (not just Settings), and reconnecting the **same** Google account preserves the sync checkpoint. A different account resets it.
- B) Silent retry, no banner.

**Q11. Multiple calendars:**
- ✅ **A)** V1 syncs the **primary calendar only**, but the schema stores per-calendar sync state so adding a picker later is UI-only work.
- B) V1 ships a calendar picker in Settings (multi-select, primary pre-checked). Requires the wider `calendar.readonly` scope and N sync tokens.
- C) All calendars the user can read, excluding Holidays/Birthdays/Weather.

**Q12. Disconnect behaviour — what happens to synced data?**
- ✅ **A)** Delete `calendar_events` rows and all *pending* calendar suggestions. **Keep** interviews already created (they are the user's data), but clear their calendar link and stop tracking them. Show exactly this in the confirm dialog.
- B) Delete everything including calendar-created interviews.
- C) Keep everything, only revoke the token.

**Q13. Disconnecting Calendar while Gmail stays connected (and vice versa):**
- ✅ **A)** Independent toggles. Disconnecting one does not revoke the other; the Google token is only revoked when the last product is disconnected.
- B) One switch for both.

**Q14. Should the user's Google account for Calendar be allowed to differ from the Gmail one?**
- ✅ **A)** No in V1 (one Google account per user). If Q7=A this is structural. Show a clear error if they authorize a different account.
- B) Yes, allow different accounts per product.

### C. Sync architecture

**Q15. Webhook vs polling:**
- ✅ **A) Polling only**, identical trigger model to 9A: on connect, on app-open (throttled), on manual "Sync Now". Google Calendar push channels need a verified public HTTPS domain, expire and must be renewed on a schedule, and there is no cron in this app.
- B) Push notifications (`events.watch` + webhook endpoint) plus a renewal job. Requires introducing Cloudflare Cron Triggers.

**Q16. Do Gmail and Calendar sync together?**
- ✅ **A)** One "Sync Now" and one app-open trigger runs both, sequentially, each with its own lock and checkpoint so a failure in one never blocks the other. Settings still shows per-product status.
- B) Fully separate triggers and buttons.

**Q17. Calendar sync throttle interval (app-open trigger):**
- ✅ **A)** 15 minutes (calendar changes matter more urgently than email; Gmail stays at 30).
- B) 30 minutes, same as Gmail.
- C) 60 minutes.

**Q18. Incremental strategy:**
- ✅ **A)** `events.list` with `singleEvents=true` for the initial windowed full sync, capture `nextSyncToken`, then token-based incremental sync forever after. On HTTP 410 GONE, discard the token and re-run a full sync automatically (silently, this is normal Google behaviour).
- B) `updatedMin` polling with no sync token (simpler, but never reports deletions).

**Q19. Historical lookback window (`timeMin`):**
- A) 7 days
- ✅ **B)** 30 days
- C) 90 days
- D) 365 days

**Q20. Future lookahead window (`timeMax`):**
- A) 30 days
- ✅ **B)** 90 days
- C) 180 days
- D) No limit

**Q21. Window rolling.** Per Google's docs, a sync token inherits the `timeMin`/`timeMax` of the full sync that produced it, and those params cannot be re-sent with the token, so the window **does not roll forward on its own**. I will verify this against the live API. Handling:
- ✅ **A)** Store `window_end` on the connection; when now + lookahead comes within 14 days of it, transparently re-run a full sync with a fresh window. Invisible to the user.
- B) Skip sync tokens entirely, re-query the window every sync (simpler, far more API traffic, still needs a separate deletion strategy).

**Q22. Batch size per sync run:**
- ✅ **A)** 250 events per run with a page-token checkpoint across runs, same discipline as 9A's 50-message batches.
- B) 100.
- C) Unbounded until the page is exhausted.

**Q23. What happens on first connect?**
- ✅ **A)** Full backfill starts immediately, paginating across runs. The Settings card shows "Scanning your calendar…" with progress ("checked 250 of ~600 events"), and finished results land in the Inbox.
- B) Backfill only future events on first connect, historical later.

**Q24. Should a sync failure be visible?**
- ✅ **A)** Same as Gmail: `last_sync_error` shown on the Settings card, silent everywhere else unless it is `needs_reauth` (which banners).
- B) Toast on every failure.

### D. Which events count as interviews

**Q25. Storage discipline for non-candidate events:**
- ✅ **A)** Mirror 9A's Stage 0: an event that fails the relevance gate is **never stored**, only counted. Nothing about the user's dentist appointment ever touches our DB.
- B) Store all events in the window (simpler dedup, much worse privacy story).

**Q26. Relevance signals (deterministic, tiered). Confirm the tiers:**
- **Tier 1 (auto-confident):** `iCalUID` matches an ICS from a synced interview email; or organizer/attendee email exactly matches an `application_contacts` row or a `gmail_messages.from_address`; or the meeting link exactly matches an existing interview's link.
- **Tier 2 (confident):** attendee domain matches a tracked application's company domain, **and** the title or description contains interview vocabulary.
- **Tier 3 (candidate):** title contains strong interview vocabulary (interview, screen, onsite, technical round, HR round, panel, coding round…) **and** there is at least one external attendee, but no application match.
- **Tier 4:** everything else, ignored and not stored.
- ✅ **A)** Ship exactly this: Tier 1 and 2 produce review items, Tier 3 produces a lower-confidence review item, Tier 4 is dropped.
- B) Tier 1 and 2 only. Tier 3 dropped (fewer false positives, misses interviews for untracked companies).
- C) Tiers 1–3 plus an AI pass on Tier 4.

**Q27. Should a solo event with no attendees ever count** (e.g. someone blocks "Interview prep — Google" on their own calendar)?
- ✅ **A)** No. No external attendee means no interview. Prevents a large false-positive class.
- B) Yes if the title matches strongly.

**Q28. Recurring events:**
- ✅ **A)** Sync with `singleEvents=true` so we see instances, never series masters. Additionally: if a single recurring series yields more than 3 candidate instances in the window, treat it as a standing meeting and drop the whole series (a weekly 1:1 is not an interview).
- B) Expand instances with no series cap.
- C) Skip anything with a `recurringEventId` entirely.

**Q29. All-day events:**
- ✅ **A)** Ingest, but flag as "time not specified". They can become an interview, but the review dialog requires a real time before accepting (mock interview and prep both assume a real instant).
- B) Ignore all-day events entirely.

**Q30. Declined invitations (the user's own `responseStatus = declined`):**
- ✅ **A)** Never create a suggestion. If an interview already exists and is linked, surface "you declined this on your calendar" on the card and offer to cancel/delete. Never change status automatically.
- B) Ingest normally, ignore response status.

**Q31. Tentative / needsAction invitations:**
- ✅ **A)** Ingest and suggest, but mark the resulting review item and interview card as "Unconfirmed" until the user accepts in Google or confirms in NextOffer.
- B) Only ingest `accepted` events.
- C) Treat tentative exactly like accepted.

**Q32. Cancelled events (arriving via incremental sync as `status=cancelled`):** see Q48 for what happens to a linked interview. For the event record itself:
- ✅ **A)** Keep the row, mark it cancelled, so we never re-suggest it and can explain why an interview went stale.
- B) Delete the row.

**Q33. Events the user is the organizer of** (they created "Interview with X" themselves):
- ✅ **A)** Treat identically to invitations. Self-created interview blocks are extremely common.
- B) Only ingest events organized by someone else.

**Q34. Meeting-link extraction:** Google Meet (`hangoutLink` and `conferenceData`), Zoom, Teams, Webex, plus any URL in `location`, then description as last resort.
- ✅ **A)** Yes, that priority order.
- B) `conferenceData`/`hangoutLink` only.

**Q35. What text do we store from an event?**
- ✅ **A)** Title in full, description truncated to 500 characters, location, organizer email, attendee emails **only for candidate events**. No other event's data ever stored.
- B) Title + location only, no description (loses dial-in details and interviewer names).
- C) Everything, untruncated.

**Q36. Interview round/type inference** (`interviews.type` is a free-text round label):
- ✅ **A)** Infer deterministically from the title ("Technical Round 2", "HR Screen"), falling back to "Interview". Always editable in the review dialog.
- B) Always "Interview", user edits it.

### E. Merge, duplicates and 9A integration

**Q37. Do calendar suggestions live in the same review queue as Gmail's?**
- ✅ **A)** Yes. One Inbox, one `SuggestionCard`/`ReviewSuggestionDialog` family, a `source` chip (Gmail / Calendar / Both), and a new "Calendar" view filter alongside the existing ones. This is what makes "no duplicate interview cards" true by construction.
- B) A separate Calendar section on the Inbox page.
- C) Calendar suggestions surface on the Interviews page instead.

**Q38. Schema consequence of Q37:**
- ✅ **A)** Generalize the existing table: add `source text NOT NULL DEFAULT 'gmail'`, add nullable `calendar_event_id`, make `gmail_message_id` nullable, add a CHECK that exactly one source ref is present. Rename `gmail_suggestions` → `suggestions` (safe now, 9A has never run in production).
- B) Same generalization but keep the table named `gmail_suggestions`.
- C) A parallel `calendar_suggestions` table (duplicates the whole review pipeline).

**Q39. `source_gmail_suggestion_id` on `applications`/`interviews`/`application_reminders`/`application_attachments`:**
- ✅ **A)** Rename to `source_suggestion_id` (same FK target, now source-agnostic). Consistent with Q38.
- B) Leave the name, document that it now means any review-queue suggestion.
- C) Add a second parallel `source_calendar_suggestion_id` column to each table.

**Q40. Should 9A start downloading `.ics` attachment bodies so we can capture `iCalUID`?** This is the single strongest merge key: the same UID appears in the invitation email and in the calendar event.
- ✅ **A)** Yes. Fetch the .ics bytes during Gmail sync only for interview-category messages, parse `UID`/`DTSTART`/`DTEND`/`LOCATION`/`ORGANIZER`, store `ical_uid` on `gmail_messages`. Costs one extra API call per interview email and also improves 9A's existing date accuracy for free.
- B) No, merge on weaker signals only.

**Q41. Merge key priority (highest to lowest):** `iCalUID` → normalized meeting link → (same application AND start within ±90 min) → (same company AND same calendar day AND title similarity).
- ✅ **A)** Ship exactly this ladder.
- B) Same ladder, but the time tolerance is ±30 minutes.
- C) Same ladder, but ±4 hours.

**Q42. Which merges are automatic vs reviewed?**
- ✅ **A)** Tiers 1–2 of Q41 (`iCalUID`, exact meeting link) merge **automatically** with no review item, because they are deterministic identity. Tiers 3–4 produce a "Possible duplicate, merge?" review item showing both records side by side.
- B) Every merge is reviewed, no exceptions.
- C) All four tiers merge automatically.

**Q43. On merge, which side wins per field?**
- ✅ **A)** Calendar wins for `scheduled_at`, `link`, `location`, `mode`. NextOffer wins for `type` (round), `status`, `notes`, `resume_id`, `application_id`, `interviewer` if already set. Never overwrite a non-empty user-entered field with an empty calendar value.
- B) Calendar wins for everything it has a value for.
- C) Ask the user field by field on every merge.

**Q44. When both an interview email and a calendar event describe the same interview and neither has been reviewed yet:**
- ✅ **A)** Whichever arrives first creates the review item; the second one merges into it and the card shows both sources ("Confirmed by email and calendar"), with a single Accept. Confidence goes up, not the item count.
- B) Suppress the Gmail suggestion entirely whenever Calendar is connected.
- C) Show both, let the user dismiss one.

**Q45. Re-suggestion guard.** If a user dismisses a calendar suggestion, or deletes an interview that came from a calendar event, the next sync must not recreate it.
- ✅ **A)** Yes, a per-event `ignored_at` tombstone on `calendar_events`, checked before suggestion generation. Also survives a full resync after a 410 GONE.
- B) Rely on the suggestion-status check only (breaks after a full resync).

**Q46. If a calendar-linked interview is deleted in NextOffer, and the event later *changes* in Google:**
- ✅ **A)** Stay silent. Deletion is an explicit "I don't want this" and the tombstone holds.
- B) Re-suggest it as new.

**Q47. Application matching for calendar events** reuses 9A's `ApplicationMatcher` extended with attendee-domain and contact-email signals, and, exactly like 9A, **never auto-picks among ambiguous candidates**.
- ✅ **A)** Yes, extend the existing matcher rather than writing a second one.
- B) A separate calendar-specific matcher.

### F. Lifecycle: reschedule, cancel, delete, override

**Q48. A synced event's start time changes in Google (reschedule):**
- ✅ **A)** If the interview is calendar-sourced and the user has not manually edited its time, update it silently and log a timeline entry. If the user *has* manually overridden the time, do not touch it; raise a review item ("Calendar says 3pm, you set 4pm").
- B) Always update silently.
- C) Always raise a review item, never auto-update.

**Q49. Manual override tracking.** Q48=A requires knowing whether a user hand-edited the time.
- ✅ **A)** Add `calendar_fields_locked` (or a per-field `manual_override` jsonb) to `interviews`, set when the user edits a calendar-managed field. A "Resync from calendar" action clears it.
- B) No override tracking, calendar always wins (simpler, will overwrite user edits).

**Q50. A synced event is cancelled or deleted in Google, and an interview is linked:**
- ✅ **A)** Never delete the interview. Mark the card "Removed from your calendar", offer Delete or Keep. Status is untouched.
- B) Add a new `cancelled` interview status and set it automatically. **Note:** `interviews.status` has no DB CHECK so this needs no migration, but it does change Module 8 analytics (a cancelled interview would still count the application as having reached interview stage unless I also change frozen analytics code).
- C) Delete the interview automatically.

**Q51. A past interview whose event was cancelled after the fact:**
- ✅ **A)** Leave it alone. History is history.
- B) Same treatment as future ones.

**Q52. Event moved *outside* the sync window (e.g. pushed 6 months out):**
- ✅ **A)** Treat as "no longer visible", not as cancelled. Keep the interview, keep the link, note the last-known time, resume tracking if it comes back into the window.
- B) Treat as cancelled.

**Q53. Interviewer/attendee changes on a synced event:**
- ✅ **A)** Update `interviewer` only if it was empty or calendar-sourced; otherwise ignore. Never spam a review item for an attendee change.
- B) Raise a review item on any attendee change.

**Q54. Meeting link changes:**
- ✅ **A)** Always update (a stale join link is actively harmful), log to the timeline.
- B) Review item.

**Q55. Timeline entries.** New `application_activity` kinds for calendar events, alongside 9A's `email_received`:
- ✅ **A)** Add `calendar_event_linked`, `interview_rescheduled`, `calendar_event_cancelled`. Timeline entries are written passively regardless of review outcome, same philosophy as 9A.
- B) No new timeline kinds.

### G. Reminders and notifications

**Q56. What does "interview reminder" mean in 9B?** Today there is **no delivery mechanism at all**: no cron, no email, no push, and the notification bell is static mock data.
- ✅ **A)** Create `application_reminders` rows (type `interview`) at T-24h and T-1h when an interview is accepted, visible in the app exactly like today's reminders. Explicitly tell the user in the UI that Google Calendar's own notifications still handle actual alerts. No new delivery infrastructure.
- B) Also wire the notification bell to real `notifications` rows (a meaningful extra scope: the bell, its read-state, its preferences, and the `notification_preferences` table are all currently unused).
- C) Also add browser push via the Notifications API + a service worker.
- D) No reminders at all in 9B.

**Q57. Reminder offsets:**
- ✅ **A)** T-24h and T-1h, fixed.
- B) User-configurable in Settings.
- C) Mirror the event's own Google reminder settings.

**Q58. `application_reminders.application_id` is NOT NULL, so a standalone calendar interview cannot have a reminder.**
- ✅ **A)** Make `application_id` nullable and add a nullable `interview_id` FK, so reminders can hang off an interview directly. Small migration, unlocks reminders for standalone interviews.
- B) No reminders for standalone interviews.

**Q59. Should the notification bell be left as mock data?**
- ✅ **A)** Yes, out of scope for 9B (call it out as known debt).
- B) No, replace it with real data as part of this module.

### H. UX

**Q60. ICS export ("Add to Calendar") from NextOffer:**
- ✅ **A)** Yes. A client-side generated `.ics` download on the interview detail page and card menu. Zero scopes, zero API calls, works even with Calendar disconnected. This is the answer to "get my interview into my calendar" without a write scope.
- B) No.

**Q61. Do we add a calendar view to the Interviews page?** (No new nav item either way.)
- ✅ **A)** Add a third view mode next to the existing Card/Table toggle: **Agenda**, grouped Today / This week / Next week / Later, with conflicts flagged. Cheap, mobile-friendly, high value.
- B) Full month grid view.
- C) Both agenda and month.
- D) Neither, keep Card/Table only.

**Q62. Interview card treatment for calendar-linked interviews:**
- ✅ **A)** A small source chip ("Calendar"/"Email"/"Both"), a stale indicator when the event is gone, an "Unconfirmed" badge for tentative, and the join link as a direct button. Plus a source filter in the existing filters bar.
- B) No visual distinction.

**Q63. Settings placement:**
- ✅ **A)** One "Google" integration card containing both Gmail and Calendar sections with independent connect/disconnect and per-product status. Matches Q7=A.
- B) A separate `CalendarConnectionCard` sibling to the existing Gmail card.

**Q64. Dashboard home:**
- ✅ **A)** Keep the existing next-interview widget, enrich it with the join link and calendar freshness, and add a single conditional attention banner ("3 calendar events look like interviews. Review") that links to the Inbox. Nothing when there is nothing to do.
- B) Add a dedicated "Today's schedule" section.
- C) No dashboard changes.

**Q65. First-time experience after connecting:**
- ✅ **A)** Redirect back to Settings with a success toast, run the backfill immediately, and show a one-time dismissible banner on the Inbox once results exist ("We found N events that look like interviews"). No wizard, no modal.
- B) A dedicated first-run bulk review screen.
- C) A multi-step onboarding wizard.

**Q66. Empty states.** Three distinct ones: not connected (what it does + Connect), connected but still scanning (progress), connected with nothing found (reassurance + "Sync Now").
- ✅ **A)** Yes, all three, matching the existing `EmptyState` primitive.
- B) One generic empty state.

**Q67. Loading states:**
- ✅ **A)** Match existing conventions: skeletons where lists already use them, per-row busy state on accept/dismiss (never a global disable, 9A already learned this), inline spinner on Sync Now.
- B) Global loading overlay.

**Q68. The merge review UI:**
- ✅ **A)** A side-by-side compare in the existing `ReviewSuggestionDialog` (NextOffer's current values | calendar's values), per-field "use this" toggles, and one Confirm. Explicitly lists what will change.
- B) A simple "Merge / Keep separate" choice with no field control.

**Q69. Bulk actions on calendar suggestions:**
- ✅ **A)** Same select-all / Accept Selected / Dismiss Selected as Gmail suggestions, no new pattern.
- B) Single-item review only (calendar backfills can produce many items at once).

**Q70. Mobile:**
- ✅ **A)** Same responsive treatment as existing pages: cards stack, agenda view is the default on small screens, side-by-side merge becomes stacked, tables scroll horizontally inside their own container.
- B) Desktop-focused, mobile untested.

**Q71. Copy style:** per your standing preference, no em dashes and no AI-sounding phrasing in any user-facing string.
- ✅ **A)** Confirmed, applies to every new string in this module.

**Q72. Should the Inbox badge count include calendar suggestions?**
- ✅ **A)** Yes, one number for the whole review queue.
- B) Separate badges.

### I. Data model

**Q73. New tables.** Minimum I see is **one**, plus columns on existing tables:

```
calendar_events            -- dedup ledger + candidate store, mirrors gmail_messages
  id, user_id, google_calendar_id, google_event_id, ical_uid,
  recurring_event_id, title, description_snippet, location, meeting_link,
  organizer_email, attendee_emails jsonb, starts_at, ends_at, is_all_day,
  event_timezone, google_status (confirmed|tentative|cancelled),
  self_response_status, etag, google_updated_at,
  relevance_tier, confidence, classified_by (rule|ai),
  matched_application_id, matched_interview_id, ignored_at,
  first_seen_at, last_seen_at
  UNIQUE (user_id, google_calendar_id, google_event_id)
```

- ✅ **A)** This one table only. Per-calendar sync state (`sync_token`, `page_token`, `window_start`, `window_end`, `backfill_complete`) lives in a small `calendar_sync_state` table keyed by (user_id, google_calendar_id), so Q11=B is later a UI-only change. That makes it **two** new tables.
- B) One table only; per-calendar sync state as columns on the connection row (blocks multi-calendar without a later migration).
- C) Something else you'd prefer.

**Q74. Columns added to `interviews`:** `calendar_event_id` (soft FK, ON DELETE SET NULL), `source` (`manual`|`gmail`|`calendar`), `calendar_fields_locked` (Q49), `last_calendar_sync_at`.
- ✅ **A)** Yes, exactly these four.
- B) Fewer, name which.

**Q75. Columns added to `gmail_messages`:** `ical_uid` (Q40).
- ✅ **A)** Yes.
- B) No (drops the strongest merge key).

**Q76. Indexes I plan:** `(user_id, starts_at)`, `(user_id, ical_uid)`, `(user_id, google_status)`, `(matched_application_id)`, `(matched_interview_id)`, plus `interviews(calendar_event_id)` and `gmail_messages(user_id, ical_uid)`.
- ✅ **A)** Yes.
- B) Review each.

**Q77. RLS:** identical to 9A. Owner select/insert/update on every new table; the OAuth callback stays the only service-role write path.
- ✅ **A)** Yes.
- B) Different, specify.

**Q78. Data volume guard.** A busy calendar over a 120-day window can produce thousands of events, but only candidates are stored (Q25).
- ✅ **A)** Additionally cap stored candidate events at 2000 per user, oldest-first eviction of past non-linked events.
- B) No cap.

### J. AI, cost, security, rate limits

**Q79. Is AI used at all in 9B?**
- ✅ **A)** Deterministic first, AI only as a Stage 2 fallback for events the rules cannot classify, registered as an experimental capability exactly like `GMAIL_CLASSIFIER`. **Free, no user credits**, consistent with 9A.
- B) Deterministic only, no AI.
- C) AI on every event.

**Q80. AI cost bound per sync run:**
- ✅ **A)** Maximum 10 AI classification calls per run, batched into one request where possible, and skipped entirely during large backfills.
- B) Unbounded.

**Q81. Does 9B ever spend user credits?**
- ✅ **A)** Never.
- B) Charge credits for something (specify).

**Q82. Prompt-injection surface.** Event titles and descriptions are attacker-controllable text that reaches an AI prompt and the UI.
- ✅ **A)** Same posture as 9A: text only, never HTML, rendered as text, delimited and untrusted in prompts, structured output validated against a schema, and no tool/action can be triggered by event content.
- B) No special handling.

**Q83. Token storage:** reuse the existing AES-256-GCM `TokenCrypto` and the same `GMAIL_TOKEN_ENCRYPTION_KEY`, or introduce a separate key?
- ✅ **A)** Reuse the existing key (one Google refresh token, one product boundary). Rename the env var to `GOOGLE_TOKEN_ENCRYPTION_KEY` only if Q7=A, keeping the old name as a fallback read.
- B) Separate key per product.

**Q84. Rate limits and backoff:** Calendar API returns 403 `rateLimitExceeded` / 429.
- ✅ **A)** Exponential backoff with jitter, bounded to 3 retries inside a run, then checkpoint and stop cleanly, mirroring the existing retry helper in `src/server/ai/retry.ts`.
- B) Fail the run immediately.

**Q85. Google API deadline:** all provider calls in this app are already bounded by a 60s deadline.
- ✅ **A)** Apply the same 60s bound to Calendar API calls, and a per-run wall-clock budget (~25s) so a Workers request never times out mid-sync. Checkpoint and continue next run.
- B) No wall-clock budget.

### K. Non-goals (confirm these are out of scope)

**Q86.** No write-back to Google Calendar (unless Q1=B). ✅ Confirm
**Q87.** No Outlook / Microsoft 365 / Apple Calendar / CalDAV in 9B. ✅ Confirm
**Q88.** No scheduling assistant, no availability sharing, no booking links. ✅ Confirm
**Q89.** No cron/background jobs introduced (unless Q15=B or Q56=B/C). ✅ Confirm
**Q90.** No changes to Module 6 (AI engine), Module 7 (interview prep/mock), or Module 8 (analytics) scoring or services. Presentation-layer touches to Interviews pages are in scope per your standing rule. ✅ Confirm

---

## 3. Defaults I will assume silently

No answer needed unless you disagree with any of these:

- Migration file named `20260811000001_module9b_calendar_intelligence.sql`, additive and idempotent, guarded `DO $$` blocks for constraints, same header-comment style as prior modules.
- New server code under `src/server/calendar/`, client service `src/services/CalendarService.ts`, repository `src/repositories/CalendarRepository.ts`, hooks under `src/features/calendar/hooks/`, components under `src/components/dashboard/calendar/`.
- Server functions in `src/server-functions/calendar.ts` (outside `src/server/**`, same rationale as `gmail.ts`).
- Hand-rolled `fetch` against Google Calendar REST v3, no `googleapis` dependency, consistent with 9A and Workers.
- Hand-rolled minimal ICS parser (UID/DTSTART/DTEND/LOCATION/ORGANIZER/STATUS/SEQUENCE), no new dependency.
- All times stored as UTC `timestamptz`, event IANA timezone stored alongside, rendered in browser-local with the source timezone shown as secondary text when it differs. No timezone setting UI; detection via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Company-name normalization reuses `CompanyExtractor`, not a new implementation.
- Same error-envelope conventions, `sonner` toasts, `DashCard`/`Chip`/`EmptyState`/`PageHeader` primitives, TanStack Query cache keys and invalidation patterns as existing modules.
- `eslint` is only ever run against exact file paths, never directory globs (known CRLF side-effect hazard in this repo).
- Vitest coverage for every new deterministic unit, using the existing `fakeSupabase` pattern. No live Google calls in tests.

---

## 4. Risks

1. **Google verification wall.** `gmail.readonly` is a *restricted* scope; shipping publicly requires an annual CASA security assessment. Calendar scopes are *sensitive* (verification but no CASA). While the app stays in **Testing** publishing status, refresh tokens **expire after 7 days**, so both Gmail and Calendar will hit `needs_reauth` weekly, and there is a 100-test-user cap. This is a pre-existing 9A condition that 9B inherits and makes more visible. It is a product/business decision, not a code one.
2. **Sync-token windowing.** If Google's sync token does not in fact inherit `timeMin`/`timeMax`, the initial full sync becomes unbounded (potentially tens of thousands of events for an old account). Mitigation is Q21=B as a fallback, plus the batch checkpoint.
3. **False positives at scale.** A calendar is far noisier than a recruiter inbox. Tier 3 detection is where this bites. Mitigation: the external-attendee requirement (Q27), the recurring-series cap (Q28), the dismiss tombstone (Q45), and shipping Tier 3 behind a measurable accuracy check during validation.
4. **Duplicate interview cards**, the exact failure you named. Mitigated structurally: `iCalUID` capture (Q40), the merge ladder (Q41), automatic merge on deterministic keys (Q42), one shared review queue (Q37). The residual risk is a recruiter email with no ICS plus a calendar event with a different link and a time outside ±90 minutes.
5. **Analytics drift.** Module 8 counts interview-stage applications from the `interviews` table. A calendar backfill that creates 40 historical interviews will visibly move those numbers. Module 8 is frozen; I will not change its math, but you should expect the shift.
6. **Overwriting user edits.** Auto-updating times from calendar is the correct default and also the most dangerous one. Mitigated by Q49's override lock; if you pick Q49=B, accept that hand-edited times can be overwritten.
7. **Workers request budget.** Sync runs inside a user request. A large backfill plus AI fallback can approach the CPU/wall limit. Mitigated by the per-run budget (Q85) and checkpointing.
8. **Two unapplied migration sets.** Module 8's and all three of 9A's migrations are still not applied to the live DB. 9B stacks on top of 9A's tables, so this must be resolved before anything can be validated live.
9. **Privacy perception.** Reading a personal calendar feels more invasive than reading email to many users. Mitigated by never storing non-candidate events (Q25) and saying so plainly in the connect card.
10. **Scope creep via reminders.** Q56=B or C turns 9B into "build the notification system", which is a module of its own.

---

## 5. Edge cases I will explicitly handle

- Event with no attendees, no link, no description.
- Event whose title is only a company name.
- Two interviews at the same company on the same day (both must survive as separate interviews).
- Back-to-back rounds in one event ("Onsite: 4 rounds, 10am to 4pm").
- Event edited in Google between our metadata fetch and detail fetch (etag mismatch).
- 410 GONE mid-backfill.
- Token revoked mid-sync.
- User declines then re-accepts an invitation.
- Series instance moved out of its recurrence pattern (an "exception" instance).
- Event moved across a DST boundary after being ingested.
- All-day event that is really a deadline, not an interview.
- Same event visible on two synced calendars (dedupe by `iCalUID`, not by event id).
- Calendar event whose ICS also arrived by email and was already accepted as an interview.
- Interview created by 9A, then the calendar invite arrives with a *different* time (the invite is authoritative).
- User disconnects Calendar with pending suggestions in the Inbox.
- User connects a different Google account than the Gmail one.
- Application deleted while a calendar suggestion targets it.
- Interview deleted while its event still exists and keeps updating.
- Empty calendar / brand-new Google account.
- Clock skew between `internalDate`, `DTSTAMP` and `now()`.

---

## 6. Migration list

Assuming the ✅ defaults:

| # | File | Contents |
|---|---|---|
| 0 | *(prerequisite, not new)* | Apply the already-written but unapplied `20260807000001` (Module 8) and `20260808000001`, `20260809000001`, `20260810000001` (Module 9A) to the live DB. |
| 1 | `20260811000001_module9b_calendar_intelligence.sql` | `calendar_events` + `calendar_sync_state` tables, RLS policies, `updated_at` triggers, indexes. |
| 2 | same file | `ALTER TABLE interviews` add `calendar_event_id`, `source`, `calendar_fields_locked`, `last_calendar_sync_at` + index. |
| 3 | same file | `ALTER TABLE gmail_messages` add `ical_uid` + index. |
| 4 | same file | `application_reminders.application_id` → nullable, add `interview_id` FK + CHECK that at least one is present (only if Q58=A). |
| 5 | same file | Suggestion generalization: `gmail_suggestions` → `suggestions`, add `source`, add `calendar_event_id`, `gmail_message_id` → nullable, one-source CHECK, policy/index/trigger renames (only if Q38=A). |
| 6 | same file | `source_gmail_suggestion_id` → `source_suggestion_id` across four tables (only if Q39=A). |
| 7 | same file | `gmail_connections` → `google_connections` + per-product columns (`gmail_enabled`, `calendar_enabled`, `calendar_status`, `calendar_connected_at`, `calendar_scope`) (only if Q7=A). |

Everything ships in **one** migration file, in dependency order, idempotent and re-runnable. Renames use `ALTER ... RENAME`, which preserves data, RLS policies and FKs.

**New env vars:** none beyond 9A's five, unless Q7=A renames them (`GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_STATE_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`), in which case old names keep working as a fallback read.
**Google Cloud change required from you:** add the Calendar scope to the consent screen, and add the new redirect URI if Q7=A.

---

## 7. Rollout plan

1. **Phase 0, unblock.** Apply outstanding migrations, create the Google Cloud OAuth client, set the five env vars, verify 9A end to end. Nothing in 9B can be validated until this is done.
2. **Phase 1, foundation.** Migration, OAuth scope upgrade, connection model, Settings card, connect/reconnect/disconnect. Verifiable on its own: connect and see "connected, 0 events".
3. **Phase 2, sync engine.** `events.list` full sync, sync token, checkpointing, batching, relevance tiers, storage discipline. Verifiable via a dev-only "Rescan calendar" tool (same pattern as the existing dev-only Rebuild Suggestions button).
4. **Phase 3, intelligence.** Classification, ICS `iCalUID` capture in 9A, application matching, merge ladder, suggestion generation.
5. **Phase 4, UX.** Inbox integration, merge dialog, interview card treatment, agenda view, dashboard banner, ICS export, empty/loading/error states.
6. **Phase 5, lifecycle.** Reschedule, cancel, delete, override lock, reminders, timeline entries.
7. **Phase 6, hardening.** Full test suite, lint/typecheck/build, live validation checklist, then a written module summary and a memory entry.

Each phase leaves the app in a working, committable state. No feature flag is introduced: the feature is gated by whether the user connected Calendar, which is the natural flag.

---

## 8. Testing plan

**Unit (vitest, no network):**
- ICS parser: UID, DTSTART with and without TZID, all-day `VALUE=DATE`, DTEND, CANCELLED status, SEQUENCE, folded lines, CRLF, escaped commas.
- Relevance tiers: fixture table of ~40 realistic events (real interviews, standups, dentist, lunch, "Interview prep" solo blocks, recurring 1:1s, all-day deadlines).
- Recurrence: series cap, exception instances, instance cancellation.
- Response status: declined/tentative/needsAction/accepted matrix.
- Merge ladder: each of the four keys in isolation, ties, and the ±90 minute boundary exactly at 89/90/91 minutes.
- Field-level merge precedence, including the "never overwrite non-empty with empty" rule.
- Override lock: hand-edited time survives a calendar reschedule.
- Tombstones: dismissed suggestion and deleted interview both survive a simulated 410 full resync.
- Sync state machine: lock claim contention, checkpoint-after-persist, 410 handling, window roll, batch pagination across runs.
- Timezone: DST-boundary events, non-local event timezone display, all-day handling.

**Integration (fake Supabase, following `fakeSupabase.ts`):**
- Full sync run against a scripted Google API stub: N events in, correct rows and suggestions out, idempotent on re-run (the key assertion: running the same sync twice creates zero additional rows).
- Gmail + Calendar describing the same interview, in both arrival orders, always producing exactly one interview.

**Regression:** the existing 224 tests must stay green, especially 9A's classifier and matcher suites given the `iCalUID` change.

**Manual, dev server:** every state of every new surface, including all three empty states, `needs_reauth` banner, merge dialog, mobile widths.

---

## 9. Production validation plan

Requires the real Google OAuth client. Checklist I will run and report on:

1. Connect Calendar from Settings, confirm consent screen shows only the intended scopes.
2. Confirm the backfill runs, progress is visible, and the run count matches the events actually in the window.
3. Seed a real test calendar with: a genuine interview invite, a decline, a tentative, a recurring standup, an all-day event, a dentist appointment, and a Google Meet interview. Verify exactly the right subset produces suggestions.
4. Accept one suggestion, confirm the interview appears with the correct time in your local timezone and the correct join link.
5. Reschedule that event in Google, re-sync, confirm the interview time updates and a timeline entry is written.
6. Hand-edit the time in NextOffer, reschedule again in Google, confirm the user's value is preserved and a review item appears.
7. Cancel the event in Google, confirm the interview is marked stale and not deleted.
8. Dismiss a suggestion, re-sync, confirm it does not come back. Then force a full resync and confirm it still does not come back.
9. With Gmail also connected, send yourself an interview invitation with an ICS attachment and confirm exactly **one** interview card results, marked as confirmed by both sources.
10. Revoke access from the Google account security page, confirm `needs_reauth` state and the reconnect path, and confirm the checkpoint is preserved on reconnect of the same account.
11. Disconnect, confirm the documented data outcome from Q12 exactly.
12. Check timing: a warm sync completes well inside the Workers request budget; log the numbers.
13. Confirm no non-candidate event data exists anywhere in the DB (direct SQL spot check).

---

## 10. Blockers I cannot resolve myself

1. Migrations `20260807000001` and `20260808/09/10000001` are not applied to the live database.
2. No Google Cloud project / OAuth client / consent screen exists, so no env vars are set and nothing OAuth-gated has ever been executed.
3. The Calendar scope must be added to the consent screen, and if Q7=A, a new redirect URI registered.
4. Decision on the Testing-vs-Published posture given the 7-day refresh-token expiry and the restricted-scope verification requirement for `gmail.readonly`.

I can write and test everything without these, and validate everything that is not OAuth-gated, but the live end-to-end pass in section 9 needs items 1 through 3 from you.
