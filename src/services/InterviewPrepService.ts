import type {
  InterviewPrep,
  InterviewPrepAnswer,
  InterviewPrepProgress,
} from "@/features/interview-prep/types";
import { interviewPrepRepository } from "@/repositories/InterviewPrepRepository";
import { interviewPrepAnswerRepository } from "@/repositories/InterviewPrepAnswerRepository";

/**
 * InterviewPrepService
 *
 * Non-AI business logic for the Interview Preparation workspace — reading the
 * generated content, tracking checklist progress, and hand-editing an
 * already-generated answer. Everything that calls the AI (generating the
 * preparation itself, generating or regenerating a per-question answer) goes
 * through server-functions/interviewPrep.ts instead, the same split
 * InterviewService uses for plain CRUD vs. how AI features route through
 * server functions elsewhere in the product.
 */
export class InterviewPrepService {
  async getPrep(interviewId: string): Promise<InterviewPrep | null> {
    return interviewPrepRepository.findByInterviewId(interviewId);
  }

  async getAnswers(interviewPrepId: string): Promise<InterviewPrepAnswer[]> {
    return interviewPrepAnswerRepository.findAllByPrepId(interviewPrepId);
  }

  async updateProgress(id: string, progress: InterviewPrepProgress): Promise<InterviewPrep> {
    return interviewPrepRepository.updateProgress(id, progress);
  }

  async updateAnswerText(
    interviewPrepId: string,
    questionId: string,
    answer: string,
  ): Promise<InterviewPrepAnswer> {
    return interviewPrepAnswerRepository.updateAnswerText(interviewPrepId, questionId, answer);
  }
}

export const interviewPrepService = new InterviewPrepService();
