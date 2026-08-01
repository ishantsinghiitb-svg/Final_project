import { AnalyticsRepository } from "@/repositories/AnalyticsRepository";
import {
  buildLastActivityMap,
  buildStatusHistory,
  computeFunnel,
  computeOverview,
  computeResumePerformance,
  computeSearchHealth,
  computeStuckInsights,
  emptyAnalyticsData,
  rangeToDates,
} from "@/features/analytics/utils";
import type { AnalyticsData, AnalyticsRangePreset } from "@/features/analytics/types";

const analyticsRepo = new AnalyticsRepository();

export class AnalyticsService {
  async getAnalytics(userId: string, range: AnalyticsRangePreset): Promise<AnalyticsData> {
    const { after, before } = rangeToDates(range);

    const [applications, resumes] = await Promise.all([
      analyticsRepo.findApplicationsInRange(userId, after, before),
      analyticsRepo.findResumeNames(userId),
    ]);

    if (applications.length === 0) {
      return emptyAnalyticsData(range, resumes.length);
    }

    const appIds = applications.map((a) => a.id);
    const [events, interviews] = await Promise.all([
      analyticsRepo.findStatusEvents(userId, appIds),
      analyticsRepo.findInterviews(userId, appIds),
    ]);

    const history = buildStatusHistory(events);
    const lastActivityAt = buildLastActivityMap(events);
    const applicationsWithInterviewIds = new Set(interviews.map((i) => i.application_id));

    const overview = computeOverview(applications, history, interviews);
    const funnel = computeFunnel(applications);
    const health = computeSearchHealth(overview);
    const { performance: resumePerformance, unlinkedCount } = computeResumePerformance(
      applications,
      history,
      applicationsWithInterviewIds,
      resumes,
    );
    const stuckInsights = computeStuckInsights(
      applications,
      lastActivityAt,
      unlinkedCount,
      overview,
    );

    return {
      range,
      overview,
      health,
      funnel,
      stuckInsights,
      resumePerformance,
      unlinkedApplicationCount: unlinkedCount,
      totalResumeCount: resumes.length,
    };
  }
}

export const analyticsService = new AnalyticsService();
