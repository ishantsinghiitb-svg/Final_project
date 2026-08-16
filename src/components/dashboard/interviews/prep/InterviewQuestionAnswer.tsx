import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Eye, Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { RichTextToolbar } from "@/components/shared/RichTextToolbar";
import { applyRichTextCommand, renderRichTextHtml, type RichTextCommand } from "@/lib/richText";
import {
  useGenerateInterviewAnswer,
  useUpdateInterviewAnswerText,
} from "@/features/interview-prep/hooks";
import { aiErrorCopy } from "@/features/ai/errorMessages";
import { AIThinkingInline } from "@/components/dashboard/ai/AIThinking";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import type { InterviewPrepAnswer, InterviewPrepQuestion } from "@/features/interview-prep/types";
import { cn } from "@/lib/utils";

type Props = {
  interviewPrepId: string;
  question: InterviewPrepQuestion;
  answer: InterviewPrepAnswer | undefined;
};

/**
 * InterviewQuestionAnswer
 *
 * Rendered only inside an already-expanded question row. Answers stay
 * opt-in (refinement #3): even when one already exists, it stays hidden
 * behind a "View Answer" click — expanding the QUESTION only ever surfaces
 * `whyAsked`, never the answer text.
 */
export function InterviewQuestionAnswer({ interviewPrepId, question, answer }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [draft, setDraft] = useState(answer?.answer ?? "");
  const [dirty, setDirty] = useState(false);

  const generate = useGenerateInterviewAnswer();
  const updateText = useUpdateInterviewAnswerText();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!dirty) setDraft(answer?.answer ?? "");
  }, [answer?.answer, dirty]);

  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    const node = textareaRef.current;
    if (pending && node) {
      node.focus();
      node.setSelectionRange(pending.start, pending.end);
      pendingSelection.current = null;
    }
  }, [draft]);

  function handleCommand(command: RichTextCommand, linkUrl?: string) {
    const node = textareaRef.current;
    if (!node) return;
    const next = applyRichTextCommand(
      command,
      { value: draft, start: node.selectionStart, end: node.selectionEnd },
      linkUrl,
    );
    pendingSelection.current = { start: next.start, end: next.end };
    setDraft(next.value);
    setDirty(true);
  }

  function handleGenerate(regenerate: boolean) {
    generate.mutate(
      { interviewPrepId, questionId: question.id, regenerate },
      {
        onSuccess: (res) => {
          if (!res.ok) {
            const copy = aiErrorCopy(res.code);
            toast.error(copy.title, { description: copy.body });
            return;
          }
          setDraft(res.answer.answer);
          setDirty(false);
          setRevealed(true);
        },
        onError: () => toast.error("Could not generate that answer. Try again."),
      },
    );
  }

  function handleSave() {
    if (!dirty) return;
    updateText.mutate(
      { interviewPrepId, questionId: question.id, answer: draft },
      {
        onSuccess: () => setDirty(false),
        onError: () => toast.error("Could not save your edit."),
      },
    );
  }

  const hasAnswer = Boolean(answer?.answer);
  const busy = generate.isPending;

  if (!revealed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {busy ? (
          <AIThinkingInline capability={AI_CAPABILITIES.INTERVIEW_PREP} className="flex-1" />
        ) : hasAnswer ? (
          <button
            onClick={() => setRevealed(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.3_0.02_265)] transition-colors hover:bg-black/[0.03]"
          >
            <Eye className="h-3.5 w-3.5" /> View Answer
          </button>
        ) : (
          <button
            onClick={() => handleGenerate(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:-translate-y-px"
          >
            <Sparkles className="h-3.5 w-3.5" /> Generate Answer
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs">
          <button
            onClick={() => setMode("write")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              mode === "write"
                ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                : "text-[oklch(0.5_0.02_265)]",
            )}
          >
            <Pencil className="mr-1 inline h-3 w-3" /> Write
          </button>
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "rounded-md px-2.5 py-1 font-medium transition-colors",
              mode === "preview"
                ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                : "text-[oklch(0.5_0.02_265)]",
            )}
          >
            <Eye className="mr-1 inline h-3 w-3" /> Preview
          </button>
        </div>
        <button
          onClick={() => handleGenerate(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Regenerate Answer
        </button>
      </div>

      {busy ? (
        <AIThinkingInline capability={AI_CAPABILITIES.INTERVIEW_PREP} />
      ) : (
        <div className="rounded-lg border border-black/5 bg-white focus-within:border-[#2563EB]/40 focus-within:ring-2 focus-within:ring-[#2563EB]/10">
          {mode === "write" ? (
            <>
              <div className="border-b border-black/5 px-1.5 py-1">
                <RichTextToolbar onCommand={handleCommand} />
              </div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDirty(true);
                }}
                onBlur={handleSave}
                rows={6}
                placeholder="Your answer…"
                className="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] outline-none"
              />
            </>
          ) : (
            <div
              className="prose prose-sm max-w-none px-3 py-2.5 text-sm text-[oklch(0.3_0.02_265)]"
              dangerouslySetInnerHTML={{
                __html: renderRichTextHtml(draft) || "<p>Nothing written yet.</p>",
              }}
            />
          )}
        </div>
      )}
      {dirty && (
        <p className="text-[11px] text-[oklch(0.55_0.02_265)]">Saving your edits automatically…</p>
      )}
    </div>
  );
}
