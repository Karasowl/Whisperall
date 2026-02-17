import { describe, it, expect } from 'vitest';

import { AI_EDIT_WARN_THRESHOLD, estimateAiEditTokens, projectAiEditBudget } from '../../src/lib/ai-edit-budget';

describe('ai-edit-budget', () => {
  it('estimates at least one token pair for empty text', () => {
    expect(estimateAiEditTokens('')).toBe(2);
  });

  it('projects over-limit usage correctly', () => {
    const budget = projectAiEditBudget({ text: 'hola mundo', used: 499_999, limit: 500_000 });
    expect(budget.overLimit).toBe(true);
    expect(budget.warnAtThreshold).toBe(false);
  });

  it('warns when projected usage reaches threshold', () => {
    const budget = projectAiEditBudget({ text: 'x'.repeat(20_000), used: 365_000, limit: 500_000 });
    expect(budget.projectedPercent).toBeGreaterThanOrEqual(AI_EDIT_WARN_THRESHOLD);
    expect(budget.warnAtThreshold).toBe(true);
    expect(budget.overLimit).toBe(false);
  });
});
