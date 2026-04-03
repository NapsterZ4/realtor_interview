import { BuyerClassification, RecommendedAction } from './enums';
import type { ActionInput, ActionOutput } from './types';

export function determineAction(input: ActionInput): ActionOutput {
  // Rule 1: Too many risk indicators
  if (input.riskIndicators.length >= 3) {
    return {
      action: RecommendedAction.ADD_TO_FOLLOW_UP,
      reasoning: `Multiple risk indicators detected (${input.riskIndicators.length}): ${input.riskIndicators.join(', ')}. Recommend follow-up to address concerns before proceeding.`,
      confidence: 'HIGH',
    };
  }

  // Rule 2: High probability + financial readiness
  if (
    input.classification === BuyerClassification.HIGH_PROBABILITY &&
    input.financialClarity !== 'LOW' &&
    (input.hasPreapproval || input.financialReadiness >= 60)
  ) {
    return {
      action: RecommendedAction.SEND_TO_LENDER,
      reasoning: 'High probability buyer with strong financial indicators. Ready for lender introduction.',
      confidence: 'HIGH',
    };
  }

  // Rule 3: Active buyer + short timeline
  if (
    input.classification === BuyerClassification.ACTIVE_BUYER &&
    input.timelineMonths <= 6
  ) {
    return {
      action: RecommendedAction.SCHEDULE_CONSULTATION,
      reasoning: 'Active buyer with timeline within 6 months. Schedule consultation to discuss next steps.',
      confidence: 'MEDIUM',
    };
  }

  // Rule 4: Active buyer + low financial clarity
  if (
    input.classification === BuyerClassification.ACTIVE_BUYER &&
    input.financialClarity === 'LOW'
  ) {
    return {
      action: RecommendedAction.SCHEDULE_CONSULTATION,
      reasoning: 'Active buyer but financial clarity is low. Schedule consultation to clarify financial situation.',
      confidence: 'MEDIUM',
    };
  }

  // Rule 5: Early buyer or research stage
  if (
    input.classification === BuyerClassification.EARLY_BUYER ||
    input.classification === BuyerClassification.RESEARCH_STAGE
  ) {
    return {
      action: RecommendedAction.ADD_TO_FOLLOW_UP,
      reasoning: `Buyer is in ${input.classification === BuyerClassification.EARLY_BUYER ? 'early' : 'research'} stage. Add to follow-up nurture sequence.`,
      confidence: 'MEDIUM',
    };
  }

  // Rule 6: Default
  return {
    action: RecommendedAction.SCHEDULE_CONSULTATION,
    reasoning: 'Default recommendation: schedule a consultation to better understand buyer needs.',
    confidence: 'LOW',
  };
}
