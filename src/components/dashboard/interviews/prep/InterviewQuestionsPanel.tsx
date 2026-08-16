import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  ChevronDown,
  Code2,
  Compass,
  Database,
  FileText,
  Flag,
  FlaskConical,
  FolderSearch,
  GitBranch,
  GitCompare,
  Handshake,
  LineChart,
  ListOrdered,
  Map as MapIcon,
  MessageCircle,
  Milestone,
  Network,
  PenTool,
  PieChart,
  Scale,
  ShieldCheck,
  Star,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Chip } from "@/components/dashboard/primitives";
import {
  QUESTION_CATEGORY_LABELS,
  QUESTION_CATEGORY_ORDER,
  QUESTION_DIFFICULTY_LABELS,
  QUESTION_PRIORITY_LABELS,
  QUESTION_PRIORITY_TONE,
} from "@/features/interview-prep/constants";
import type {
  InterviewPrepAnswer,
  InterviewPrepQuestion,
  QuestionCategory,
} from "@/features/interview-prep/types";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "./CollapsibleSection";
import { InterviewQuestionAnswer } from "./InterviewQuestionAnswer";

/**
 * One icon per category in the AI's vocabulary (schema.ts QUESTION_CATEGORIES)
 * — only the categories the AI actually selects for a given preparation ever
 * render, this just needs to cover all 29 possible values so no group is ever
 * left without an icon.
 */
const CATEGORY_ICON: Record<QuestionCategory, React.ComponentType<{ className?: string }>> = {
  resume_deep_dive: FileText,
  behavioral: Users,
  leadership: Flag,
  ownership: ShieldCheck,
  conflict_resolution: Scale,
  failure: GitBranch,
  success: Trophy,
  product_sense: Compass,
  product_design: PenTool,
  product_strategy: MapIcon,
  execution: Zap,
  roadmapping: Milestone,
  prioritization: ListOrdered,
  trade_offs: GitCompare,
  stakeholder_management: Handshake,
  analytics: BarChart3,
  metrics: LineChart,
  experimentation: FlaskConical,
  ab_testing: GitCompare,
  growth: TrendingUp,
  technical_understanding: Code2,
  architecture_awareness: Network,
  sql: Database,
  data_interpretation: PieChart,
  role_specific: Briefcase,
  company_specific: Building2,
  project_deep_dive: FolderSearch,
  case_study: BookOpen,
  estimation: Calculator,
  communication: MessageCircle,
};

function QuestionRow({
  interviewPrepId,
  question,
  answer,
}: {
  interviewPrepId: string;
  question: InterviewPrepQuestion;
  answer: InterviewPrepAnswer | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasAnswer = Boolean(answer?.answer);

  return (
    <div className="rounded-lg border border-black/5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 text-sm text-[oklch(0.25_0.02_265)]">
          {question.question}
        </span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <span className="text-[10px] text-[oklch(0.55_0.02_265)]">
            {QUESTION_DIFFICULTY_LABELS[question.difficulty]}
          </span>
          <Chip tone={QUESTION_PRIORITY_TONE[question.priority]}>
            {QUESTION_PRIORITY_LABELS[question.priority]}
          </Chip>
          {question.starRelevant && (
            <Star className="h-3 w-3 text-[#F59E0B]" aria-label="Good STAR fit" />
          )}
          {hasAnswer && <Chip tone="green">Answer ready</Chip>}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-[oklch(0.55_0.02_265)] transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>
      {expanded && (
        <div className="space-y-2.5 border-t border-black/5 px-3 py-3">
          {question.sourceTag && <Chip tone="blue">{question.sourceTag}</Chip>}
          {question.whyAsked && (
            <p className="text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
              <span className="font-medium text-[oklch(0.4_0.02_265)]">Why this is likely: </span>
              {question.whyAsked}
            </p>
          )}
          <InterviewQuestionAnswer
            interviewPrepId={interviewPrepId}
            question={question}
            answer={answer}
          />
        </div>
      )}
    </div>
  );
}

type Props = {
  interviewPrepId: string;
  questions: InterviewPrepQuestion[];
  answers: InterviewPrepAnswer[];
};

/**
 * InterviewQuestionsPanel
 *
 * §4 Personalized Interview Questions — grouped by category as collapsible
 * groups (progressive disclosure), each question individually expandable.
 * Expanding a question NEVER reveals or generates its answer (refinement
 * #3) — that always needs its own deliberate click, handled by
 * InterviewQuestionAnswer.
 */
export function InterviewQuestionsPanel({ interviewPrepId, questions, answers }: Props) {
  const answersByQuestion = new Map(answers.map((a) => [a.question_id, a]));

  const groups = QUESTION_CATEGORY_ORDER.map((category) => ({
    category,
    items: questions.filter((q) => q.category === category),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <CollapsibleSection
          key={group.category}
          icon={CATEGORY_ICON[group.category]}
          title={QUESTION_CATEGORY_LABELS[group.category]}
          meta={`${group.items.length}`}
        >
          <div className="space-y-2">
            {group.items.map((question) => (
              <QuestionRow
                key={question.id}
                interviewPrepId={interviewPrepId}
                question={question}
                answer={answersByQuestion.get(question.id)}
              />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}
