import { describe, it, expect } from 'vitest';
import { checkCompletion, REQUIRED_SIGNALS } from '../completion-rules';
import { SignalCategory } from '../enums';

describe('Completion Rules', () => {
  it('returns incomplete when no signals', () => {
    const result = checkCompletion([]);
    expect(result.isComplete).toBe(false);
    expect(result.completionPercent).toBe(0);
    expect(result.missing).toHaveLength(REQUIRED_SIGNALS.length);
  });

  it('returns complete when all signals present with sufficient confidence', () => {
    const signals = REQUIRED_SIGNALS.map((r) => ({
      signalKey: r.signalKey,
      signalCategory: r.category,
      confidence: 0.8,
    }));
    const result = checkCompletion(signals);
    expect(result.isComplete).toBe(true);
    expect(result.completionPercent).toBe(100);
    expect(result.missing).toHaveLength(0);
  });

  it('rejects signals with confidence < 0.5', () => {
    const signals = REQUIRED_SIGNALS.map((r) => ({
      signalKey: r.signalKey,
      signalCategory: r.category,
      confidence: 0.3,
    }));
    const result = checkCompletion(signals);
    expect(result.isComplete).toBe(false);
    expect(result.completionPercent).toBe(0);
  });

  it('counts partial completion correctly', () => {
    const signals = [
      { signalKey: 'buyer_type', signalCategory: SignalCategory.BUYER_MOTIVATION, confidence: 0.8 },
      { signalKey: 'motivation', signalCategory: SignalCategory.BUYER_MOTIVATION, confidence: 0.7 },
      { signalKey: 'timeline', signalCategory: SignalCategory.TIMELINE, confidence: 0.6 },
    ];
    const result = checkCompletion(signals);
    expect(result.isComplete).toBe(false);
    expect(result.completionPercent).toBeCloseTo(42.86, 1);
    expect(result.missing).toHaveLength(4);
  });

  it('accepts exactly 0.5 confidence', () => {
    const signals = REQUIRED_SIGNALS.map((r) => ({
      signalKey: r.signalKey,
      signalCategory: r.category,
      confidence: 0.5,
    }));
    const result = checkCompletion(signals);
    expect(result.isComplete).toBe(true);
  });

  it('uses highest confidence when duplicate signal keys exist', () => {
    const signals = [
      { signalKey: 'buyer_type', signalCategory: SignalCategory.BUYER_MOTIVATION, confidence: 0.3 },
      { signalKey: 'buyer_type', signalCategory: SignalCategory.BUYER_MOTIVATION, confidence: 0.8 },
    ];
    const result = checkCompletion(signals);
    const missingKeys = result.missing.map((m) => m.signalKey);
    expect(missingKeys).not.toContain('buyer_type');
  });

  it('requires all 7 signals', () => {
    expect(REQUIRED_SIGNALS).toHaveLength(7);
  });
});
