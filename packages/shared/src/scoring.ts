import { BuyerClassification } from './enums';
import type { ScoringInput, ScoringOutput } from './types';

const WEIGHTS = {
  motivation: 0.30,
  financial: 0.35,
  engagement: 0.15,
  timeline: 0.20,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function classify(score: number): BuyerClassification {
  if (score >= 80) return BuyerClassification.HIGH_PROBABILITY;
  if (score >= 60) return BuyerClassification.ACTIVE_BUYER;
  if (score >= 40) return BuyerClassification.EARLY_BUYER;
  return BuyerClassification.RESEARCH_STAGE;
}

export function calculateScore(input: ScoringInput): ScoringOutput {
  const motivation = clamp(input.motivationScore, 0, 100);
  const financial = clamp(input.financialReadiness, 0, 100);
  const engagement = clamp(input.engagementScore, 0, 100);
  const timeline = clamp(input.timelineScore, 0, 100);

  const composite =
    motivation * WEIGHTS.motivation +
    financial * WEIGHTS.financial +
    engagement * WEIGHTS.engagement +
    timeline * WEIGHTS.timeline;

  return {
    motivationScore: motivation,
    financialReadiness: financial,
    engagementScore: engagement,
    timelineScore: timeline,
    buyerProbabilityScore: Math.round(composite * 100) / 100,
    classification: classify(composite),
  };
}
