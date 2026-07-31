import { AlertCircle, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { AIPage, AIPageHeader } from "@/components/dashboard/ai/AIPage";
import { AIMetaStrip } from "@/components/dashboard/ai/AIMeta";
import { AIErrorNotice } from "@/components/dashboard/ai/AIErrorNotice";
import { DashButton } from "@/components/dashboard/DashButton";
import { Chip, EmptyState } from "@/components/dashboard/primitives";
import {
  useGenerateMockInterviewReport,
  useMockInterviewSession,
  useMockInterviewTurns,
} from "@/features/mock-interview/hooks";
import { MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS } from "@/features/mock-interview/constants";
import { roundTone } from "@/features/interviews/constants";
import type { Interview } from "@/types";
import { ReportHero } from "./ReportHero";
import { StrengthsWeaknessesPanel } from "./StrengthsWeaknessesPanel";
import { CompetencyScoreList } from "./CompetencyScoreList";
import { CommunicationConfidencePanel } from "./CommunicationConfidencePanel";
import { AnswerHighlights } from "./AnswerHighlights";
import { AdditionalQuestionsPanel } from "./AdditionalQuestionsPanel";
import { StudyPlanPanel } from "./StudyPlanPanel";
import { ReportTranscript, transcriptAnchorId } from "./ReportTranscript";

// ── MockInterviewReport (Module 7C) ──
//
// Reopening this page is always free — see MockInterviewAIService's credit
// invariant. The one action that can still charge is starting an entirely
// new mock interview from here (StudyPlanPanel's "Start another" link),
// which goes back through the launcher's own confirmation.

export function MockInterviewReport({
  interview,
  sessionId,
}: {
  interview: Interview;
  sessionId: string;
}) {
  const { data: session, isLoading: sessionLoading } = useMockInterviewSession(sessionId);
  const { data: turns = [] } = useMockInterviewTurns(sessionId);
  const generateReport = useGenerateMockInterviewReport();

  function scrollToTurn(turnIndex: number) {
    document
      .getElementById(transcriptAnchorId(turnIndex))
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (sessionLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Mock interview not found"
        body="It may have been deleted. Head back to your interviews list."
      />
    );
  }

  const attemptsExhausted =
    session.report_attempts >= MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS && !session.report;

  return (
    <AIPage>
      <AIPageHeader
        backTo="/dashboard/interviews/$interviewId"
        backParams={{ interviewId: interview.id }}
        backLabel="Interview details"
        icon={Sparkles}
        title="Mock Interview Report"
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip tone="default">{interview.company_name}</Chip>
            {session.round_label && (
              <Chip tone={roundTone(session.round_label)}>{session.round_label}</Chip>
            )}
            <Chip tone="purple">{session.interviewer_role_label}</Chip>
          </span>
        }
        actions={
          session.report && (
            <DashButton
              variant="outline"
              size="sm"
              onClick={() => generateReport.mutate({ sessionId, regenerate: true })}
              disabled={
                generateReport.isPending ||
                session.report_attempts >= MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS
              }
            >
              <RotateCcw className="h-3.5 w-3.5" /> Regenerate report
            </DashButton>
          )
        }
      />

      {session.report ? (
        <div className="space-y-4">
          <AIMetaStrip generatedAt={session.report_generated_at} />
          <ReportHero session={session} />
          <StrengthsWeaknessesPanel report={session.report} />
          <CompetencyScoreList scores={session.report.competencyScores} onCite={scrollToTurn} />
          <CommunicationConfidencePanel report={session.report} />
          <AnswerHighlights report={session.report} onCite={scrollToTurn} />
          <AdditionalQuestionsPanel report={session.report} />
          <StudyPlanPanel report={session.report} interviewId={interview.id} />
          <ReportTranscript turns={turns} />
        </div>
      ) : attemptsExhausted ? (
        <AIErrorNotice code="report_attempts_exhausted" />
      ) : (
        <div className="rounded-2xl border border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.03] to-[#7C3AED]/[0.04] p-6 text-center">
          <p className="text-sm text-[oklch(0.4_0.02_265)]">
            This interview has ended, but its report hasn't been generated yet.
          </p>
          <DashButton
            className="mt-4"
            disabled={generateReport.isPending}
            onClick={() => generateReport.mutate({ sessionId })}
          >
            <Sparkles className="h-4 w-4" /> Generate report
          </DashButton>
          {generateReport.data && !generateReport.data.ok && (
            <div className="mt-4 text-left">
              <AIErrorNotice
                code={generateReport.data.code}
                creditsRefunded={generateReport.data.creditsRefunded}
              />
            </div>
          )}
        </div>
      )}
    </AIPage>
  );
}
