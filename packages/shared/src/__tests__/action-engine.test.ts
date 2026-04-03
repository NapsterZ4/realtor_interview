import { describe, it, expect } from 'vitest';
import { determineAction } from '../action-engine';
import { BuyerClassification, RecommendedAction } from '../enums';
import type { ActionInput } from '../types';

function makeInput(overrides: Partial<ActionInput> = {}): ActionInput {
  return {
    classification: BuyerClassification.ACTIVE_BUYER,
    buyerProbabilityScore: 70,
    hasPreapproval: false,
    timelineMonths: 6,
    riskIndicators: [],
    financialClarity: 'MEDIUM',
    financialReadiness: 70,
    ...overrides,
  };
}

describe('Action Engine', () => {
  it('Rule 1: returns ADD_TO_FOLLOW_UP when >= 3 risk indicators', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.HIGH_PROBABILITY,
      riskIndicators: ['risk1', 'risk2', 'risk3'],
    }));
    expect(result.action).toBe(RecommendedAction.ADD_TO_FOLLOW_UP);
    expect(result.confidence).toBe('HIGH');
  });

  it('Rule 1 takes priority over Rule 2', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.HIGH_PROBABILITY,
      hasPreapproval: true,
      financialClarity: 'HIGH',
      riskIndicators: ['a', 'b', 'c'],
    }));
    expect(result.action).toBe(RecommendedAction.ADD_TO_FOLLOW_UP);
  });

  it('Rule 2: HIGH_PROBABILITY + preapproval → SEND_TO_LENDER', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.HIGH_PROBABILITY,
      hasPreapproval: true,
      financialClarity: 'HIGH',
    }));
    expect(result.action).toBe(RecommendedAction.SEND_TO_LENDER);
    expect(result.confidence).toBe('HIGH');
  });

  it('Rule 2: HIGH_PROBABILITY + financialReadiness >= 60 → SEND_TO_LENDER', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.HIGH_PROBABILITY,
      hasPreapproval: false,
      financialReadiness: 60,
      financialClarity: 'MEDIUM',
    }));
    expect(result.action).toBe(RecommendedAction.SEND_TO_LENDER);
  });

  it('Rule 2 blocked by LOW financial clarity', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.HIGH_PROBABILITY,
      hasPreapproval: true,
      financialClarity: 'LOW',
    }));
    expect(result.action).not.toBe(RecommendedAction.SEND_TO_LENDER);
  });

  it('Rule 3: ACTIVE_BUYER + timeline <= 6 months → SCHEDULE_CONSULTATION', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.ACTIVE_BUYER,
      timelineMonths: 3,
      financialClarity: 'HIGH',
    }));
    expect(result.action).toBe(RecommendedAction.SCHEDULE_CONSULTATION);
  });

  it('Rule 4: ACTIVE_BUYER + LOW financial clarity → SCHEDULE_CONSULTATION', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.ACTIVE_BUYER,
      timelineMonths: 12,
      financialClarity: 'LOW',
    }));
    expect(result.action).toBe(RecommendedAction.SCHEDULE_CONSULTATION);
  });

  it('Rule 5: EARLY_BUYER → ADD_TO_FOLLOW_UP', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.EARLY_BUYER,
      timelineMonths: 12,
      financialClarity: 'MEDIUM',
    }));
    expect(result.action).toBe(RecommendedAction.ADD_TO_FOLLOW_UP);
  });

  it('Rule 5: RESEARCH_STAGE → ADD_TO_FOLLOW_UP', () => {
    const result = determineAction(makeInput({
      classification: BuyerClassification.RESEARCH_STAGE,
    }));
    expect(result.action).toBe(RecommendedAction.ADD_TO_FOLLOW_UP);
  });

  it('Rule 6: default fallback → SCHEDULE_CONSULTATION', () => {
    // HIGH_PROBABILITY but LOW financial clarity + no preapproval + financialReadiness < 60
    const result = determineAction(makeInput({
      classification: BuyerClassification.HIGH_PROBABILITY,
      hasPreapproval: false,
      financialReadiness: 50,
      financialClarity: 'LOW',
      timelineMonths: 12,
    }));
    expect(result.action).toBe(RecommendedAction.SCHEDULE_CONSULTATION);
    expect(result.confidence).toBe('LOW');
  });
});
