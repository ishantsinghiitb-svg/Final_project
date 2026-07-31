import type { MockInterviewSession, MockInterviewTurn } from "@/features/mock-interview/types";
import { mockInterviewSessionRepository } from "@/repositories/MockInterviewSessionRepository";
import { mockInterviewTurnRepository } from "@/repositories/MockInterviewTurnRepository";

/**
 * MockInterviewService
 *
 * Non-AI reads for the Mock Interview Studio — listing past sessions,
 * reading one session (for the studio or the report), and reading its
 * transcript. Every write (start, submit an answer, pause, resume, end,
 * generate the report) is credit- or session-state-sensitive and goes
 * through server-functions/mockInterview.ts instead, the same split
 * InterviewPrepService uses for its own AI vs. non-AI operations.
 */
export class MockInterviewService {
  async listSessions(interviewId: string): Promise<MockInterviewSession[]> {
    return mockInterviewSessionRepository.findAllByInterviewId(interviewId);
  }

  async getSession(sessionId: string): Promise<MockInterviewSession | null> {
    return mockInterviewSessionRepository.findById(sessionId);
  }

  async getTurns(sessionId: string): Promise<MockInterviewTurn[]> {
    return mockInterviewTurnRepository.findAllBySessionId(sessionId);
  }
}

export const mockInterviewService = new MockInterviewService();
