import { describe, it, expect } from 'vitest';
import { calculateScore } from '../scoring';
import { BuyerClassification } from '../enums';

describe('Scoring Engine', () => {
  it('calculates weighted composite correctly', () => {
    const result = calculateScore({
      motivationScore: 100,
      financialReadiness: 100,
      engagementScore: 100,
      timelineScore: 100,
    });
    expect(result.buyerProbabilityScore).toBe(100);
    expect(result.classification).toBe(BuyerClassification.HIGH_PROBABILITY);
  });

  it('calculates zero scores correctly', () => {
    const result = calculateScore({
      motivationScore: 0,
      financialReadiness: 0,
      engagementScore: 0,
      timelineScore: 0,
    });
    expect(result.buyerProbabilityScore).toBe(0);
    expect(result.classification).toBe(BuyerClassification.RESEARCH_STAGE);
  });

  it('applies correct weights (30/35/15/20)', () => {
    const result = calculateScore({
      motivationScore: 100,
      financialReadiness: 0,
      engagementScore: 0,
      timelineScore: 0,
    });
    expect(result.buyerProbabilityScore).toBe(30);
  });

  it('classifies RESEARCH_STAGE for score < 40', () => {
    const result = calculateScore({
      motivationScore: 30,
      financialReadiness: 30,
      engagementScore: 30,
      timelineScore: 30,
    });
    expect(result.buyerProbabilityScore).toBe(30);
    expect(result.classification).toBe(BuyerClassification.RESEARCH_STAGE);
  });

  it('classifies EARLY_BUYER for score 40-59', () => {
    const result = calculateScore({
      motivationScore: 50,
      financialReadiness: 50,
      engagementScore: 50,
      timelineScore: 50,
    });
    expect(result.buyerProbabilityScore).toBe(50);
    expect(result.classification).toBe(BuyerClassification.EARLY_BUYER);
  });

  it('classifies ACTIVE_BUYER for score 60-79', () => {
    const result = calculateScore({
      motivationScore: 70,
      financialReadiness: 70,
      engagementScore: 70,
      timelineScore: 70,
    });
    expect(result.buyerProbabilityScore).toBe(70);
    expect(result.classification).toBe(BuyerClassification.ACTIVE_BUYER);
  });

  it('classifies HIGH_PROBABILITY for score >= 80', () => {
    const result = calculateScore({
      motivationScore: 90,
      financialReadiness: 90,
      engagementScore: 90,
      timelineScore: 90,
    });
    expect(result.buyerProbabilityScore).toBe(90);
    expect(result.classification).toBe(BuyerClassification.HIGH_PROBABILITY);
  });

  it('clamps values above 100', () => {
    const result = calculateScore({
      motivationScore: 150,
      financialReadiness: 100,
      engagementScore: 100,
      timelineScore: 100,
    });
    expect(result.motivationScore).toBe(100);
    expect(result.buyerProbabilityScore).toBe(100);
  });

  it('clamps values below 0', () => {
    const result = calculateScore({
      motivationScore: -10,
      financialReadiness: 50,
      engagementScore: 50,
      timelineScore: 50,
    });
    expect(result.motivationScore).toBe(0);
  });

  it('applies correct financial weight (35%)', () => {
    const result = calculateScore({
      motivationScore: 0,
      financialReadiness: 100,
      engagementScore: 0,
      timelineScore: 0,
    });
    expect(result.buyerProbabilityScore).toBe(35);
  });
});
