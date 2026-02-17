export const AI_EDIT_WARN_THRESHOLD = 75;

export type AiEditBudget = {
  tokenEstimate: number;
  used: number;
  limit: number;
  projected: number;
  projectedPercent: number;
  remaining: number;
  remainingAfter: number;
  overLimit: boolean;
  warnAtThreshold: boolean;
};

export function estimateAiEditTokens(text: string): number {
  const inputTokens = Math.max(1, Math.ceil(text.length / 4));
  return inputTokens * 2;
}

export function projectAiEditBudget(opts: { text: string; used: number; limit: number }): AiEditBudget {
  const tokenEstimate = estimateAiEditTokens(opts.text);
  const used = Math.max(0, opts.used);
  const limit = Math.max(0, opts.limit);
  const projected = used + tokenEstimate;
  const remaining = Math.max(0, limit - used);
  const remainingAfter = Math.max(0, limit - projected);
  const projectedPercent = limit > 0 ? Math.round((projected / limit) * 100) : 100;
  const overLimit = limit <= 0 ? tokenEstimate > 0 : projected > limit;
  return {
    tokenEstimate,
    used,
    limit,
    projected,
    projectedPercent,
    remaining,
    remainingAfter,
    overLimit,
    warnAtThreshold: !overLimit && projectedPercent >= AI_EDIT_WARN_THRESHOLD,
  };
}
