import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { WorkflowPrompt } from "@/components/shared/WorkflowPrompt";
import { interviewService } from "@/services/InterviewService";

// ── Applications ↔ Interviews sync prompts ──
//
// Two lightweight, non-blocking workflow prompts (rendered via sonner's
// toast.custom — see WorkflowPrompt — positioned bottom-center so they read
// as an important decision rather than a passing notification) keep the two
// features loosely in sync without forcing either direction. Dismissal state
// is session-only, in-memory — there's no persistence pattern to reuse for
// this and none was asked for.

const dismissedSchedulePrompt = new Set<string>();
const dismissedMovePrompt = new Set<string>();

const PROMPT_DURATION_MS = 8_000;

/**
 * Flow B — an application was manually moved into "interview" status but has
 * no interview scheduled yet. Call after a successful status-change mutation.
 */
export async function maybePromptScheduleInterview(
  applicationId: string,
  onScheduleNow: () => void,
): Promise<void> {
  if (dismissedSchedulePrompt.has(applicationId)) return;

  const existing = await interviewService.getInterviewsForApplication(applicationId);
  if (existing.length > 0) return;

  const dismiss = () => dismissedSchedulePrompt.add(applicationId);

  toast.custom(
    (id) => (
      <WorkflowPrompt
        icon={CalendarClock}
        title="Moved to Interview Stage"
        question="Schedule the interview now?"
        description="Keep your pipeline and your interview calendar in sync."
        primaryLabel="Schedule Interview"
        onPrimary={() => {
          toast.dismiss(id);
          dismiss();
          onScheduleNow();
        }}
        secondaryLabel="Later"
        onSecondary={() => {
          toast.dismiss(id);
          dismiss();
        }}
      />
    ),
    {
      position: "bottom-center",
      duration: PROMPT_DURATION_MS,
      unstyled: true,
      onDismiss: dismiss,
      onAutoClose: dismiss,
    },
  );
}

/**
 * Flow A — an interview was just scheduled for an application that isn't yet
 * in the "interview" stage. Call after a successful linked-interview create.
 */
export function promptMoveToInterviewStage(applicationId: string, onMove: () => void): void {
  if (dismissedMovePrompt.has(applicationId)) return;

  const dismiss = () => dismissedMovePrompt.add(applicationId);

  toast.custom(
    (id) => (
      <WorkflowPrompt
        icon={CalendarClock}
        title="Interview Scheduled"
        question="Move this application to the Interview stage?"
        description="This keeps your application pipeline synchronized with your interview schedule."
        primaryLabel="Move to Interview"
        onPrimary={() => {
          toast.dismiss(id);
          dismiss();
          onMove();
        }}
        secondaryLabel="Keep Current"
        onSecondary={() => {
          toast.dismiss(id);
          dismiss();
        }}
      />
    ),
    {
      position: "bottom-center",
      duration: PROMPT_DURATION_MS,
      unstyled: true,
      onDismiss: dismiss,
      onAutoClose: dismiss,
    },
  );
}
