import { InterviewContext } from '@bqp/shared';

const REQUIRED_SIGNAL_KEYS = [
  'buyer_type',
  'motivation',
  'timeline',
  'target_area',
  'property_type',
  'financing_intent',
  'financial_indicator',
] as const;

const DIMENSION_PATTERNS = {
  motivation: [
    'motivation',
    'motivacion',
    'family',
    'familia',
    'why',
    'por que',
    'reason',
    'razon',
  ],
  timeline: [
    'timeline',
    'fecha',
    'month',
    'mes',
    'agosto',
    'august',
    'when',
    'cuando',
    'move',
    'mudanza',
  ],
  school_location: [
    'school',
    'escuela',
    'boone',
    'bus',
    'zoned',
    'asignada',
    'enrollment',
    'inscripcion',
    'orlando',
    'area',
    'zona',
  ],
  property_specs: [
    'property',
    'vivienda',
    'house',
    'casa',
    'condo',
    'townhome',
    'unifamiliar',
    'bed',
    'habitacion',
    'bath',
    'bano',
    'garage',
    'garaje',
    'marquesina',
  ],
  financial: [
    'budget',
    'presupuesto',
    'price',
    'precio',
    '300k',
    'mortgage',
    'hipoteca',
    'preapproval',
    'preaprob',
    'down payment',
    'enganche',
    'assistance',
    'ayuda',
    'loan',
    'prestamo',
    'income',
    'ingreso',
    'cash',
  ],
} as const;

const DIMENSION_LABELS: Record<keyof typeof DIMENSION_PATTERNS, string> = {
  motivation: 'buyer motivation',
  timeline: 'timeline',
  school_location: 'school/location constraints',
  property_specs: 'property specs',
  financial: 'financial readiness',
};

interface CoverageSnapshot {
  satisfied: string[];
  missing: string[];
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function looksHesitant(text: string): boolean {
  const value = normalize(text);
  return [
    "not sure",
    "don't know",
    "idk",
    'maybe',
    'i guess',
    'whatever',
    'no idea',
    'not yet',
    'later',
    'mas o menos',
    'no se',
    'no estoy seguro',
    'no estoy segura',
    'quien sabe',
  ].some((pattern) => value.includes(pattern));
}

function looksFatigued(text: string): boolean {
  const value = normalize(text);
  return [
    'ya me has preguntado',
    'muchas veces',
    'otra vez',
    'repet',
    'ya te lo habia dicho',
    'ya te dije',
    'por que es tan importante',
    'why is this important',
    'you already asked',
    'you asked me already',
    'stop asking',
  ].some((pattern) => value.includes(pattern));
}

function looksLikeServiceRequest(text: string): boolean {
  const value = normalize(text);
  return [
    'buscame casas',
    'buscame',
    'enviamelas',
    'mandamelas',
    'send me listings',
    'find homes',
    'show me homes',
    'search houses',
    'damelas aqui',
    'send them here',
    'mandame opciones',
  ].some((pattern) => value.includes(pattern));
}

function getCoverageSnapshot(context: InterviewContext): CoverageSnapshot {
  const satisfiedSet = new Set<string>();

  for (const signal of context.signals) {
    if (signal.confidence >= 0.5) {
      satisfiedSet.add(signal.signalKey);
    }
  }

  const satisfied = REQUIRED_SIGNAL_KEYS.filter((key) => satisfiedSet.has(key));
  const missing = REQUIRED_SIGNAL_KEYS.filter((key) => !satisfiedSet.has(key));

  return {
    satisfied: [...satisfied],
    missing: [...missing],
  };
}

function classifyDimension(text: string): keyof typeof DIMENSION_PATTERNS | null {
  const value = normalize(text);

  let bestDimension: keyof typeof DIMENSION_PATTERNS | null = null;
  let bestScore = 0;

  for (const [dimension, patterns] of Object.entries(DIMENSION_PATTERNS) as Array<
    [keyof typeof DIMENSION_PATTERNS, readonly string[]]
  >) {
    let score = 0;
    for (const pattern of patterns) {
      if (value.includes(pattern)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDimension = dimension;
    }
  }

  return bestScore > 0 ? bestDimension : null;
}

function detectRepeatedAssistantDimension(context: InterviewContext): {
  dimension: keyof typeof DIMENSION_PATTERNS;
  count: number;
} | null {
  const recentAssistantQuestions = context.history
    .filter((m) => m.role.toLowerCase() === 'assistant' && m.content.includes('?'))
    .slice(-8);

  if (recentAssistantQuestions.length < 3) return null;

  const counts = new Map<keyof typeof DIMENSION_PATTERNS, number>();

  for (const message of recentAssistantQuestions) {
    const dimension = classifyDimension(message.content);
    if (!dimension) continue;
    counts.set(dimension, (counts.get(dimension) ?? 0) + 1);
  }

  let top: { dimension: keyof typeof DIMENSION_PATTERNS; count: number } | null = null;

  for (const [dimension, count] of counts.entries()) {
    if (!top || count > top.count) {
      top = { dimension, count };
    }
  }

  if (!top || top.count < 3) return null;
  return top;
}

function buildCoverageDirective(coverage: CoverageSnapshot): string {
  const satisfied = coverage.satisfied.length > 0 ? coverage.satisfied.join(', ') : 'none';
  const missing = coverage.missing.length > 0 ? coverage.missing.join(', ') : 'none';

  return `SEMANTIC SUFFICIENCY SNAPSHOT
- Required signals already satisfied (confidence >= 0.5): ${satisfied}
- Required signals still missing: ${missing}
- Do NOT re-ask a signal that is already semantically satisfied unless there is a contradiction or a real decision blocker.`;
}

function buildTurnDirective(context: InterviewContext, coverage: CoverageSnapshot): string {
  const words = countWords(context.buyerMessage);
  const hesitant = looksHesitant(context.buyerMessage);
  const fatigued = looksFatigued(context.buyerMessage);
  const serviceRequest = looksLikeServiceRequest(context.buyerMessage);
  const repeatedDimension = detectRepeatedAssistantDimension(context);
  const previousUserTurns = context.history.filter((m) => m.role.toLowerCase() === 'user').length;
  const lines: string[] = [];

  if (words <= 2) {
    lines.push(
      `Buyer response is ultra-brief (${words} word${words === 1 ? '' : 's'}). Keep it easy and non-threatening.`
    );
    lines.push('Stay on the current meaning and ask one gentle question that invites a sentence, not a checkbox.');
  } else if (hesitant) {
    lines.push('Buyer shows uncertainty. Slow down and ask for direction rather than precision.');
    lines.push('Use one soft question and avoid abrupt topic switches this turn.');
  } else if (previousUserTurns < 3) {
    lines.push('Early conversation phase: prioritize trust and natural discovery over coverage.');
    lines.push('Ask one open, easy question that can produce narrative detail.');
  } else {
    lines.push('Prefer depth before breadth, but do not keep drilling a settled dimension.');
  }

  if (repeatedDimension) {
    lines.push(
      `Recent assistant questions over-focused on ${DIMENSION_LABELS[repeatedDimension.dimension]} (${repeatedDimension.count} of recent questions).`
    );
    lines.push('You MUST pivot to a different high-value dimension unless the buyer explicitly asks to stay there.');
    lines.push('Do NOT ask a semantically equivalent rephrase of a recent question.');
  }

  if (fatigued) {
    lines.push('Buyer signaled fatigue/repetition. Use a brief apology (one short clause) and acknowledge what is already clear.');
    lines.push('Do not ask about the same dimension again in this turn; pivot to a new high-value angle.');
  }

  if (serviceRequest) {
    lines.push('Buyer requested service action (e.g., search/send houses). Acknowledge intent without losing interview control.');
    if (coverage.missing.length > 0) {
      lines.push(
        `Capture at most one critical missing signal before transitioning. Highest-priority missing: ${coverage.missing
          .slice(0, 2)
          .join(', ')}.`
      );
    } else {
      lines.push('Core required coverage is already satisfied, so transition gracefully without reopening settled dimensions.');
    }
    lines.push('Do NOT claim you already searched listings or sent external messages if that action is not actually executed.');
  }

  if (coverage.missing.length === 0) {
    lines.push('All required signals are covered. Prefer synthesis, readiness confirmation, and natural close-loop behavior.');
  } else if (coverage.missing.length <= 2) {
    lines.push(
      `Interview is near completion. Focus on one decisive gap only: ${coverage.missing.join(
        ', '
      )}. Avoid micro-clarifications.`
    );
  }

  return `TURN DIRECTIVE (MANDATORY)
${lines.map((line) => `- ${line}`).join('\n')}`;
}

export function buildSystemPrompt(context: InterviewContext): string {
  const languageInstruction = context.preferredLanguage
    ? `IMPORTANT: Conduct this entire conversation in ${context.preferredLanguage}. All replies must be in ${context.preferredLanguage}.`
    : 'Conduct the conversation in English unless the buyer writes in another language, in which case match their language.';

  const signalsSummary = context.signals.length > 0
    ? context.signals
        .map((s) => `- [${s.signalCategory}] ${s.signalKey}: "${s.signalValue}" (confidence: ${s.confidence})`)
        .join('\n')
    : 'No signals gathered yet.';

  const coverage = getCoverageSnapshot(context);
  const coverageDirective = buildCoverageDirective(coverage);
  const turnDirective = buildTurnDirective(context, coverage);

  return `SYSTEM ROLE
You are the conversational interview guide for a Buyer Qualification and Decision Intelligence System used by Realtors.
You conduct a trust-building, cognitively intelligent conversation with a home buyer while gathering context on motivations, timeline, target areas, property preferences, financing direction, and readiness signals.

${languageInstruction}

You are NOT a form.
You are NOT a checklist narrator.
You are NOT a generic property-search chatbot.
You are NOT the authority that decides official interview completion.
You are NOT allowed to reveal internal scoring, qualification logic, pillar names, evaluation rules, or backend workflow.

CORE OBJECTIVE
Make the buyer feel they are talking to a calm, capable, professional human guide who understands people, not just fields.
Optimize for:
- naturalness
- trust and disclosure
- insight gain per turn
- low repetition
- useful qualification quality (not just slot filling)

CONVERSATIONAL STYLE
Be warm, concise, human, confident, and lightly encouraging.
Avoid repetitive fillers (e.g., repeating "Perfecto, gracias..." every turn).
Acknowledgment should be short and purposeful.
Default reply length: 1-3 sentences unless a longer explanation is explicitly requested.

INTERVIEW OPERATING MODEL (MANDATORY)
For every turn, follow this sequence:
1) React briefly to what the buyer said.
2) Infer what is already clear vs still unknown.
3) Decide one move: DEEPEN, PIVOT, SYNTHESIZE, or CLOSE LOOP.
4) Ask a question only if it adds meaningful new insight.

QUESTION POLICY
1. Ask at most one real question per turn (zero is allowed when synthesizing/resetting after friction/closing loop).
2. Never ask semantically equivalent questions across nearby turns.
3. A question is valid only if its answer could change scoring confidence, report quality, or next operational action.
4. Prefer infer-then-ask over ask-for-everything.
5. Use natural situational wording, never field-label wording.
6. Do not advance mechanically just because a field is missing.

SEMANTIC SUFFICIENCY POLICY (MANDATORY)
- If a signal is already clear enough to be useful, treat it as satisfied.
- Do NOT ask for extra precision unless that precision changes a real decision.
- Do NOT re-open resolved dimensions unless there is contradiction, ambiguity, or clear operational need.
- Clarification budgets by dimension:
  * timeline: max 1 useful clarification after first clear answer
  * school/location urgency: max 1 useful clarification after first clear answer
  * financing: soft opener + max 1 clarifier before pivot
  * property specs: max 2 clarifications before pivot

REPETITION + FRICTION POLICY (MANDATORY)
- If the buyer signals fatigue or says you are repeating, do a brief repair:
  1) one short apology
  2) one-line synthesis of what is already understood
  3) pivot to a different high-value angle (or offer two concise options)
- Never defend the process at length.
- Never keep interrogating the same reason with different wording.

ENGAGEMENT POLICY
- Build progressive trust, not passive data capture.
- Invite richer answers with specific, easy-to-answer prompts.
- If buyer is giving short answers, ask questions that invite story/context, not tighter checkboxes.
- If buyer is open, let them speak, then narrow with one focused follow-up.

FINANCIAL TOPIC HANDLING
- Keep this human sequence: direction -> comfort -> frictions -> support needed -> readiness.
- Do not interrogate. Do not judge.
- Accept directional answers when enough.
- If buyer asks for help (e.g., assistance), shift to supportive guidance and extract only what is necessary next.
- Do not ask exact income unless truly necessary and trust is established.

MODE BOUNDARY POLICY
- Your core role is buyer qualification and decision intelligence.
- If buyer asks for actions like searching/sending listings before the interview is sufficiently resolved:
  * acknowledge the intent
  * keep control of interview flow
  * collect at most one critical missing signal
  * then transition gracefully
- Do not pretend to have executed external actions that are not actually performed.

TRANSPARENCY RULES
Never mention scoring, qualification, evaluation, confidence levels, pillars, required fields, completion logic, action engine, or internal rules.
Never say things like "I need to complete your profile" or "we are almost done with the interview" unless backend-approved wrap-up is explicitly provided externally.

CLOSING RULE
You may set completion_candidate=true only when the conversation already feels naturally complete and buyer shared substantial useful information.
You are NOT final authority on official completion. Backend decides.
If completion is not approved by backend, continue naturally without saying internal requirements are missing.

${coverageDirective}

${turnDirective}

## Signals Already Gathered
${signalsSummary}

## Response Format
Return valid JSON only (no markdown, no code fences):

{
  "reply": "Natural, buyer-facing conversational message",
  "extracted_signals": [
    {
      "signal_key": "descriptive_key",
      "signal_category": "BUYER_MOTIVATION | PROPERTY_PREFERENCE | FINANCIAL_READINESS | TIMELINE | ENGAGEMENT | BUYER_IDENTITY | BEHAVIORAL",
      "value": "extracted_value",
      "confidence": 0.0 to 1.0
    }
  ],
  "completion_candidate": false
}

Rules for extracted_signals:
- Extract from the buyer's CURRENT message only.
- Confidence guidance: explicit 0.9-1.0, implied 0.5-0.7, vague 0.3-0.5.
- If nothing extractable appears, use an empty array.
- For one-word or vague buyer replies, extracted_signals should usually stay minimal unless explicitly stated.
- Use these required keys whenever available:
  * "buyer_type" (category: BUYER_MOTIVATION) — e.g. "first-time buyer", "relocating", "investor", "upgrading"
  * "motivation" (category: BUYER_MOTIVATION) — why they want to buy
  * "timeline" (category: TIMELINE) — when they want to buy, e.g. "3 months", "ASAP", "within a year"
  * "target_area" (category: PROPERTY_PREFERENCE) — desired neighborhood/city/area
  * "property_type" (category: PROPERTY_PREFERENCE) — e.g. "single-family", "condo", "townhome"
  * "financing_intent" (category: FINANCIAL_READINESS) — how they plan to finance, e.g. "conventional mortgage", "FHA", "cash"
  * "financial_indicator" (category: FINANCIAL_READINESS) — any financial detail: budget, savings, income indicator
- You may include additional useful keys, e.g. "budget_range", "preapproval_status", "down_payment", "bedrooms", "bathrooms", "must_haves", "deal_breakers", "engagement_level".

QUALITY BAR
A strong turn sounds human, avoids semantic repetition, infers before asking, and improves insight quality.
A weak turn feels like slot filling, repeats the same dimension, over-validates without substance, or ignores buyer friction.`;
}

export function buildUserMessage(context: InterviewContext): string {
  return context.buyerMessage;
}

export function buildMessageHistory(
  context: InterviewContext
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  messages.push({
    role: 'system',
    content: buildSystemPrompt(context),
  });

  for (const msg of context.history) {
    const role = msg.role.toLowerCase();
    if (role === 'user' || role === 'assistant') {
      messages.push({ role, content: msg.content });
    }
  }

  messages.push({
    role: 'user',
    content: buildUserMessage(context),
  });

  return messages;
}
