import { SignalCategory } from './enums';
import type { RequiredSignal } from './types';

export const REQUIRED_SIGNALS: RequiredSignal[] = [
  { signalKey: 'buyer_type', category: SignalCategory.BUYER_MOTIVATION },
  { signalKey: 'motivation', category: SignalCategory.BUYER_MOTIVATION },
  { signalKey: 'timeline', category: SignalCategory.TIMELINE },
  { signalKey: 'target_area', category: SignalCategory.PROPERTY_PREFERENCE },
  { signalKey: 'property_type', category: SignalCategory.PROPERTY_PREFERENCE },
  { signalKey: 'financing_intent', category: SignalCategory.FINANCIAL_READINESS },
  { signalKey: 'financial_indicator', category: SignalCategory.FINANCIAL_READINESS },
];

const MIN_CONFIDENCE = 0.5;

export interface SignalRecord {
  signalKey: string;
  signalCategory: string;
  confidence: number;
}

export function checkCompletion(signals: SignalRecord[]): {
  isComplete: boolean;
  completionPercent: number;
  missing: RequiredSignal[];
} {
  const latestSignals = new Map<string, SignalRecord>();
  for (const signal of signals) {
    const existing = latestSignals.get(signal.signalKey);
    if (!existing || signal.confidence > existing.confidence) {
      latestSignals.set(signal.signalKey, signal);
    }
  }

  const satisfied: RequiredSignal[] = [];
  const missing: RequiredSignal[] = [];

  for (const required of REQUIRED_SIGNALS) {
    const signal = latestSignals.get(required.signalKey);
    if (signal && signal.confidence >= MIN_CONFIDENCE) {
      satisfied.push(required);
    } else {
      missing.push(required);
    }
  }

  const completionPercent = (satisfied.length / REQUIRED_SIGNALS.length) * 100;

  return {
    isComplete: missing.length === 0,
    completionPercent,
    missing,
  };
}
