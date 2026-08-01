// ── Fake Supabase client for RecommendationsService tests (Module 8B) ──
//
// Implements exactly the query surface RecommendationsService touches, one
// case per table, and nothing more. Any table access outside that set
// throws — which is what makes "this service never touches ai_cache" an
// assertion the fake enforces by construction, not just something a test
// happens not to check.

export type FakeRecommendationsSeed = {
  applications?: Record<string, unknown>[];
  resumes?: Record<string, unknown>[];
  interviews?: Record<string, unknown>[];
  profile?: Record<string, unknown> | null;
  interviewPreps?: Record<string, unknown>[];
  mockSessions?: Record<string, unknown>[];
  atsRows?: Record<string, unknown>[];
  activity?: Record<string, unknown>[];
};

type QueryResult = { data: unknown; error: { message: string } | null };

function thenableChain(rows: unknown[]) {
  const result: QueryResult = { data: rows, error: null };
  const chain = {
    eq: () => chain,
    in: () => chain,
    not: () => chain,
    maybeSingle: async (): Promise<QueryResult> => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

export function createFakeRecommendationsSupabase(seed: FakeRecommendationsSeed = {}) {
  const runInserts: Record<string, unknown>[] = [];

  function from(table: string) {
    switch (table) {
      case "applications":
        return { select: () => thenableChain(seed.applications ?? []) };
      case "resumes":
        return { select: () => thenableChain(seed.resumes ?? []) };
      case "interviews":
        return { select: () => thenableChain(seed.interviews ?? []) };
      case "profiles":
        return { select: () => thenableChain(seed.profile ? [seed.profile] : []) };
      case "interview_preps":
        return { select: () => thenableChain(seed.interviewPreps ?? []) };
      case "mock_interview_sessions":
        return { select: () => thenableChain(seed.mockSessions ?? []) };
      case "ai_analyses":
        return { select: () => thenableChain(seed.atsRows ?? []) };
      case "application_activity":
        return { select: () => thenableChain(seed.activity ?? []) };
      case "ai_runs":
        return {
          insert: (values: Record<string, unknown>) => {
            runInserts.push(values);
            return Promise.resolve({ error: null });
          },
        };
      default:
        throw new Error(`Fake Supabase: unexpected table access "${table}"`);
    }
  }

  return {
    client: { from } as unknown,
    runInserts,
  };
}
