import {
  BuyerClassification,
  RecommendedAction,
  SignalCategory,
} from './enums';

// API Response types
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: number;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Scoring types
export interface ScoringInput {
  motivationScore: number;
  financialReadiness: number;
  engagementScore: number;
  timelineScore: number;
}

export interface ScoringOutput {
  motivationScore: number;
  financialReadiness: number;
  engagementScore: number;
  timelineScore: number;
  buyerProbabilityScore: number;
  classification: BuyerClassification;
}

// Action engine types
export type FinancialClarity = 'HIGH' | 'MEDIUM' | 'LOW';
export type ActionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ActionInput {
  classification: BuyerClassification;
  buyerProbabilityScore: number;
  hasPreapproval: boolean;
  timelineMonths: number;
  riskIndicators: string[];
  financialClarity: FinancialClarity;
  financialReadiness: number;
}

export interface ActionOutput {
  action: RecommendedAction;
  reasoning: string;
  confidence: ActionConfidence;
}

// Completion rules
export interface RequiredSignal {
  signalKey: string;
  category: SignalCategory;
}

// AI engine types
export interface ExtractedSignalInput {
  signal_key: string;
  signal_category: string;
  value: string;
  confidence: number;
}

export interface AIResponse {
  reply: string;
  extracted_signals: ExtractedSignalInput[];
  current_pillar: string;
  pillars_touched: string[];
  completion_candidate: boolean;
}

export interface InterviewContext {
  buyerMessage: string;
  history: Array<{ role: string; content: string }>;
  signals: Array<{
    signalKey: string;
    signalCategory: string;
    signalValue: string;
    confidence: number;
  }>;
  preferredLanguage?: string;
}

// Report types
export interface QuickSnapshot {
  buyerName: string;
  classification: BuyerClassification;
  score: number;
  recommendedAction: RecommendedAction;
  topRisks: string[];
}

export interface BuyerProfile {
  buyerType: string;
  motivation: string;
  timeline: string;
  engagementLevel: string;
}

export interface FinancialSnapshot {
  budgetRange: string;
  preapproval: string;
  downPayment: string;
  financingIntent: string;
  clarity: FinancialClarity;
}

export interface PropertyPreferences {
  area: string;
  type: string;
  mustHaves: string[];
  dealBreakers: string[];
}

export interface RiskIndicator {
  indicator: string;
  severity: string;
  detail: string;
}

export interface ReportPayload {
  quickSnapshot: QuickSnapshot;
  buyerProfile: BuyerProfile;
  financialSnapshot: FinancialSnapshot;
  propertyPreferences: PropertyPreferences;
  scores: ScoringOutput;
  riskIndicators: RiskIndicator[];
  aiRecommendation: ActionOutput;
}

export interface LenderSnapshot {
  buyerName: string;
  contactEmail?: string;
  contactPhone?: string;
  financialSnapshot: FinancialSnapshot;
  propertyPreferences: PropertyPreferences;
  timeline: string;
  realtorName: string;
  realtorEmail: string;
  realtorPhone?: string;
  realtorCompany?: string;
}
