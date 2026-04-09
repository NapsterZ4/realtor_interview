import OpenAI from 'openai';
import { InterviewContext, AIResponse, ExtractedSignalInput } from '@bqp/shared';
import { buildMessageHistory } from './prompt';

const VALID_SIGNAL_CATEGORIES = [
  'BUYER_IDENTITY',
  'BUYER_MOTIVATION',
  'PROPERTY_PREFERENCE',
  'FINANCIAL_READINESS',
  'BEHAVIORAL',
  'TIMELINE',
  'ENGAGEMENT',
];

const VALID_PILLARS = [
  'Motivation',
  'Timeline',
  'Property Preferences',
  'Financial Readiness',
  'Engagement',
];

function getDefaultModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function buildFallbackResponse(): AIResponse {
  return {
    reply: "I appreciate your patience! I'm having a small technical hiccup. Could you repeat what you just said? I want to make sure I don't miss anything.",
    extracted_signals: [],
    current_pillar: 'Motivation',
    pillars_touched: [],
    completion_candidate: false,
  };
}

function isValidSignal(signal: unknown): signal is ExtractedSignalInput {
  if (typeof signal !== 'object' || signal === null) return false;
  const s = signal as Record<string, unknown>;
  return (
    typeof s.signal_key === 'string' &&
    s.signal_key.length > 0 &&
    typeof s.signal_category === 'string' &&
    VALID_SIGNAL_CATEGORIES.includes(s.signal_category) &&
    typeof s.value === 'string' &&
    s.value.length > 0 &&
    typeof s.confidence === 'number' &&
    s.confidence >= 0 &&
    s.confidence <= 1
  );
}

function validateAndSanitize(parsed: unknown): AIResponse | null {
  if (typeof parsed !== 'object' || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.reply !== 'string' || obj.reply.trim().length === 0) {
    return null;
  }

  const extractedSignals: ExtractedSignalInput[] = [];
  if (Array.isArray(obj.extracted_signals)) {
    for (const signal of obj.extracted_signals) {
      if (isValidSignal(signal)) {
        extractedSignals.push({
          signal_key: signal.signal_key,
          signal_category: signal.signal_category,
          value: signal.value,
          confidence: Math.round(signal.confidence * 100) / 100,
        });
      }
    }
  }

  const currentPillar =
    typeof obj.current_pillar === 'string' && VALID_PILLARS.includes(obj.current_pillar)
      ? obj.current_pillar
      : inferCurrentPillar(extractedSignals);

  const pillarsTouched: string[] = [];
  if (Array.isArray(obj.pillars_touched)) {
    for (const p of obj.pillars_touched) {
      if (typeof p === 'string' && VALID_PILLARS.includes(p) && !pillarsTouched.includes(p)) {
        pillarsTouched.push(p);
      }
    }
  }

  const completionCandidate =
    typeof obj.completion_candidate === 'boolean'
      ? obj.completion_candidate
      : typeof obj.interview_feels_complete === 'boolean'
        ? obj.interview_feels_complete
        : false;

  return {
    reply: obj.reply.trim(),
    extracted_signals: extractedSignals,
    current_pillar: currentPillar,
    pillars_touched: pillarsTouched,
    completion_candidate: completionCandidate,
  };
}

function inferCurrentPillar(extractedSignals: ExtractedSignalInput[]): string {
  const firstSignal = extractedSignals[0];

  if (!firstSignal) {
    return 'Motivation';
  }

  switch (firstSignal.signal_category) {
    case 'TIMELINE':
      return 'Timeline';
    case 'PROPERTY_PREFERENCE':
      return 'Property Preferences';
    case 'FINANCIAL_READINESS':
      return 'Financial Readiness';
    case 'ENGAGEMENT':
      return 'Engagement';
    default:
      return 'Motivation';
  }
}

export interface InterviewAIEngineOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class InterviewAIEngine {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(options: InterviewAIEngineOptions = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    });
    this.model = options.model || getDefaultModel();
    this.maxTokens = options.maxTokens || 2048;
    this.temperature = options.temperature ?? 0.7;
  }

  async processMessage(context: InterviewContext): Promise<AIResponse> {
    try {
      const messages = buildMessageHistory(context);

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices?.[0]?.message?.content;

      if (!content) {
        console.error('AI engine: empty response from OpenAI');
        return buildFallbackResponse();
      }

      return this.parseResponse(content);
    } catch (error) {
      console.error('AI engine: error processing message', error);
      return buildFallbackResponse();
    }
  }

  private parseResponse(raw: string): AIResponse {
    try {
      const parsed = JSON.parse(raw);
      const validated = validateAndSanitize(parsed);

      if (!validated) {
        console.error('AI engine: response failed validation', raw);
        return buildFallbackResponse();
      }

      return validated;
    } catch (error) {
      console.error('AI engine: failed to parse JSON response', error, raw);
      return buildFallbackResponse();
    }
  }
}
