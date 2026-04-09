import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import {
  validateTransition,
  checkCompletion,
  calculateScore,
  InterviewSessionStatus,
  WorkflowStatus,
  SignalCategory,
  MessageRole,
} from '@bqp/shared';
import { sendCompletionEmail } from '../lib/email';
import { InterviewAIEngine } from '@bqp/ai-engine';

const INTERVIEW_EXPIRY_DAYS = parseInt(
  process.env.INTERVIEW_EXPIRY_DAYS ?? '14',
  10
);
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

const messageSchema = z.object({
  message: z.string().min(1),
});

function getSignalVal(signals: Array<{ signalKey: string; signalValue: string }>, key: string): string {
  return signals.find((s) => s.signalKey === key)?.signalValue ?? '';
}

function buildBuyerStrategy(
  signals: Array<{ signalKey: string; signalValue: string; signalCategory: string; confidence: number }>,
  buyerName: string
) {
  const buyerType = getSignalVal(signals, 'buyer_type') || 'homebuyer';
  const motivation = getSignalVal(signals, 'motivation') || '';
  const timeline = getSignalVal(signals, 'timeline') || 'Not specified';
  const targetArea = getSignalVal(signals, 'target_area') || 'your preferred area';
  const propertyType = getSignalVal(signals, 'property_type') || 'home';
  const financingIntent = getSignalVal(signals, 'financing_intent') || '';
  const financialIndicator = getSignalVal(signals, 'financial_indicator') || '';
  const budgetRange = getSignalVal(signals, 'budget_range') || '';
  const preapproval = getSignalVal(signals, 'preapproval_status') || '';
  const downPayment = getSignalVal(signals, 'down_payment') || '';
  const bedrooms = getSignalVal(signals, 'bedrooms') || '';
  const bathrooms = getSignalVal(signals, 'bathrooms') || '';
  const mustHaves = getSignalVal(signals, 'must_haves') || '';
  const engagementLevel = getSignalVal(signals, 'engagement_level') || '';

  // Profile description
  const profileParts: string[] = [];
  if (buyerType) profileParts.push(`${buyerType.charAt(0).toUpperCase() + buyerType.slice(1)}`);
  if (motivation) profileParts.push(`focused on ${motivation.toLowerCase()}`);
  const profileDescription = profileParts.join(' ') || 'Homebuyer';

  // Timeline description
  let timelineNote = '';
  const tl = timeline.toLowerCase();
  if (tl.includes('asap') || tl.includes('immediate') || tl.includes('1 month') || tl.includes('2 month')) {
    timelineNote = 'Targeting a quick move-in';
  } else if (tl.includes('3 month') || tl.includes('6 month')) {
    timelineNote = 'Actively searching';
  } else if (tl.includes('year') || tl.includes('12')) {
    timelineNote = 'Planning ahead';
  }

  // Price description
  let priceDescription = budgetRange || financialIndicator || 'To be discussed with your realtor';
  if (financialIndicator && !budgetRange) {
    priceDescription = `Based on ${financialIndicator}`;
  }

  // Property line
  const propParts: string[] = [];
  if (propertyType) propParts.push(propertyType);
  if (bedrooms) propParts.push(`${bedrooms} bed`);
  if (bathrooms) propParts.push(`${bathrooms} bath`);
  const propertyLine = propParts.join(' · ') || propertyType;

  // Preferences note
  let preferencesNote = '';
  if (mustHaves) {
    preferencesNote = `Looking for: ${mustHaves}.`;
  } else if (motivation) {
    preferencesNote = `Looking for a home that meets your ${motivation.toLowerCase()} needs.`;
  }

  // Next steps (personalized)
  const nextSteps: string[] = [];
  const hasPreapproval = preapproval.toLowerCase().includes('yes') || preapproval.toLowerCase().includes('approved');

  if (!hasPreapproval) {
    const lenderStep = buyerType.toLowerCase().includes('first')
      ? 'Connect with a local lender to obtain a Pre-Approval letter and explore first-time homebuyer assistance programs.'
      : 'Connect with a lender to obtain a Pre-Approval letter and confirm your purchasing power.';
    nextSteps.push(lenderStep);
  } else {
    nextSteps.push('Review your pre-approval terms with your realtor to ensure they align with your target price range.');
  }

  if (targetArea && budgetRange) {
    nextSteps.push(`Review current ${targetArea} listings with your realtor that fit your ${budgetRange} budget.`);
  } else if (targetArea) {
    nextSteps.push(`Review current ${targetArea} listings with your realtor.`);
  } else {
    nextSteps.push('Start reviewing listings in your preferred areas with your realtor.');
  }

  nextSteps.push('Schedule a consultation to review the next steps of buying, such as inspections and closing costs.');

  // Realtor message (personalized)
  const msgParts: string[] = [];
  msgParts.push(`It is so exciting to help you on your home buying journey!`);
  if (timeline && tl.includes('month')) {
    msgParts.push(`Since you are looking to move within ${timeline}, our priority will be getting everything in order quickly so we can start touring homes.`);
  }
  if (downPayment) {
    msgParts.push(`Your savings of ${downPayment} is a great foundation, and we will look into programs that can help maximize that investment.`);
  }
  if (financingIntent) {
    msgParts.push(`We'll work together on your ${financingIntent.toLowerCase()} financing strategy.`);
  }
  msgParts.push(`I'll be here to walk you through every step, from the first tour to handing you the keys!`);
  const realtorMessage = msgParts.join(' ');

  return {
    buyerName,
    profileDescription,
    timeline,
    timelineNote,
    priceDescription,
    propertyLine,
    targetArea,
    preferencesNote,
    nextSteps,
    realtorMessage,
  };
}

export default async function interviewRoutes(app: FastifyInstance) {
  // --- Authenticated routes ---

  app.post(
    '/clients/:clientId/interviews',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id: realtorId } = request.user as { id: string };
      const { clientId } = request.params as { clientId: string };

      const client = await prisma.client.findFirst({
        where: { id: clientId, realtorId },
        include: { clientWorkflow: true },
      });

      if (!client) {
        return reply.status(404).send({
          success: false,
          error: { code: 404, message: 'Client not found' },
        });
      }

      // Check max 1 active session
      const activeSession = await prisma.interviewSession.findFirst({
        where: {
          clientId,
          status: {
            notIn: [
              InterviewSessionStatus.COMPLETED,
              InterviewSessionStatus.EXPIRED,
              InterviewSessionStatus.ABANDONED,
            ],
          },
        },
      });

      if (activeSession) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 409,
            message: 'Client already has an active interview session',
          },
        });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INTERVIEW_EXPIRY_DAYS);

      const token = crypto.randomUUID();

      const session = await prisma.interviewSession.create({
        data: {
          clientId,
          token,
          status: InterviewSessionStatus.PENDING,
          expiresAt,
        },
      });

      // Update workflow to INTERVIEW_SENT
      if (client.clientWorkflow) {
        const canTransition = validateTransition(
          'workflow',
          client.clientWorkflow.status,
          WorkflowStatus.INTERVIEW_SENT
        );
        if (canTransition) {
          await prisma.clientWorkflow.update({
            where: { id: client.clientWorkflow.id },
            data: { status: WorkflowStatus.INTERVIEW_SENT },
          });
        }
      }

      const interviewUrl = `${APP_URL}/interview/${token}`;

      return reply.status(201).send({
        success: true,
        data: { session, interviewUrl },
      });
    }
  );

  // --- Public routes ---

  app.get('/interviews/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const session = await prisma.interviewSession.findUnique({
      where: { token },
      include: {
        messages: { orderBy: { sequenceNumber: 'asc' } },
        client: { select: { name: true, preferredLanguage: true } },
      },
    });

    if (!session) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Interview session not found' },
      });
    }

    // Check expiration
    if (
      session.expiresAt < new Date() &&
      session.status !== InterviewSessionStatus.COMPLETED &&
      session.status !== InterviewSessionStatus.EXPIRED
    ) {
      const canTransition = validateTransition(
        'interview',
        session.status,
        InterviewSessionStatus.EXPIRED
      );
      if (canTransition) {
        await prisma.interviewSession.update({
          where: { id: session.id },
          data: { status: InterviewSessionStatus.EXPIRED },
        });
      }

      return reply.send({
        success: true,
        data: {
          status: InterviewSessionStatus.EXPIRED,
          messages: session.messages,
          completionPercent: session.completionPercent,
        },
      });
    }

    // For completed sessions, build and return the buyer strategy
    let buyerStrategy = null;
    if (session.status === InterviewSessionStatus.COMPLETED) {
      const latestSignals = await prisma.extractedSignal.findMany({
        where: {
          interviewSessionId: session.id,
          supersededById: null,
        },
      });
      buyerStrategy = buildBuyerStrategy(latestSignals, session.client.name);
    }

    return reply.send({
      success: true,
      data: {
        status: session.status,
        messages: session.messages,
        completionPercent: session.completionPercent,
        clientName: session.client.name,
        ...(buyerStrategy ? { buyerStrategy } : {}),
      },
    });
  });

  app.post('/interviews/:token/messages', async (request, reply) => {
    const { token } = request.params as { token: string };

    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 400, message: 'Message is required' },
      });
    }

    const { message: buyerMessage } = parsed.data;

    // Load session
    const session = await prisma.interviewSession.findUnique({
      where: { token },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            preferredLanguage: true,
            clientWorkflow: true,
          },
        },
      },
    });

    if (!session) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Interview session not found' },
      });
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      const canTransition = validateTransition(
        'interview',
        session.status,
        InterviewSessionStatus.EXPIRED
      );
      if (canTransition) {
        await prisma.interviewSession.update({
          where: { id: session.id },
          data: { status: InterviewSessionStatus.EXPIRED },
        });
      }
      return reply.status(409).send({
        success: false,
        error: { code: 409, message: 'Interview session has expired' },
      });
    }

    // Status transitions
    let currentStatus = session.status;

    if (currentStatus === InterviewSessionStatus.COMPLETED) {
      return reply.status(409).send({
        success: false,
        error: { code: 409, message: 'Interview session is already completed' },
      });
    }

    if (currentStatus === InterviewSessionStatus.EXPIRED) {
      return reply.status(409).send({
        success: false,
        error: { code: 409, message: 'Interview session has expired' },
      });
    }

    if (currentStatus === InterviewSessionStatus.AWAITING_VALIDATION) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 409,
          message: 'Interview session is awaiting validation',
        },
      });
    }

    // PENDING -> IN_PROGRESS
    if (currentStatus === InterviewSessionStatus.PENDING) {
      const canTransition = validateTransition(
        'interview',
        currentStatus,
        InterviewSessionStatus.IN_PROGRESS
      );
      if (!canTransition) {
        return reply.status(409).send({
          success: false,
          error: { code: 409, message: 'Invalid state transition' },
        });
      }
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: {
          status: InterviewSessionStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      currentStatus = InterviewSessionStatus.IN_PROGRESS;
    }

    // ABANDONED -> IN_PROGRESS (resume)
    if (currentStatus === InterviewSessionStatus.ABANDONED) {
      const canTransition = validateTransition(
        'interview',
        currentStatus,
        InterviewSessionStatus.IN_PROGRESS
      );
      if (!canTransition) {
        return reply.status(409).send({
          success: false,
          error: { code: 409, message: 'Invalid state transition' },
        });
      }
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { status: InterviewSessionStatus.IN_PROGRESS },
      });
      currentStatus = InterviewSessionStatus.IN_PROGRESS;
    }

    // Load message history
    const messages = await prisma.interviewMessage.findMany({
      where: { interviewSessionId: session.id },
      orderBy: { sequenceNumber: 'asc' },
    });

    // Load current signals (latest version only)
    const signals = await prisma.extractedSignal.findMany({
      where: {
        interviewSessionId: session.id,
        supersededById: null,
      },
    });

    const history = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const signalContext = signals.map((s: any) => ({
      signalKey: s.signalKey,
      signalCategory: s.signalCategory,
      signalValue: s.signalValue,
      confidence: s.confidence,
    }));

    // Call AI engine
    const aiEngine = new InterviewAIEngine();
    const aiResponse = await aiEngine.processMessage({
      buyerMessage,
      history,
      signals: signalContext,
      preferredLanguage: session.client.preferredLanguage ?? undefined,
    });

    // Get next sequence number
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const nextSeq = lastMessage ? lastMessage.sequenceNumber + 1 : 1;

    // Save buyer message + AI reply
    await prisma.interviewMessage.createMany({
      data: [
        {
          interviewSessionId: session.id,
          role: MessageRole.USER,
          content: buyerMessage,
          sequenceNumber: nextSeq,
          pillar: aiResponse.current_pillar,
        },
        {
          interviewSessionId: session.id,
          role: MessageRole.ASSISTANT,
          content: aiResponse.reply,
          sequenceNumber: nextSeq + 1,
          pillar: aiResponse.current_pillar,
        },
      ],
    });

    // Upsert signals
    for (const extracted of aiResponse.extracted_signals) {
      const existingSignal = await prisma.extractedSignal.findFirst({
        where: {
          interviewSessionId: session.id,
          signalKey: extracted.signal_key,
          supersededById: null,
        },
      });

      if (existingSignal) {
        // Create new version, supersede old one
        const newSignal = await prisma.extractedSignal.create({
          data: {
            interviewSessionId: session.id,
            signalCategory: extracted.signal_category as SignalCategory,
            signalKey: extracted.signal_key,
            signalValue: extracted.value,
            confidence: extracted.confidence,
            version: existingSignal.version + 1,
          },
        });
        await prisma.extractedSignal.update({
          where: { id: existingSignal.id },
          data: { supersededById: newSignal.id },
        });
      } else {
        await prisma.extractedSignal.create({
          data: {
            interviewSessionId: session.id,
            signalCategory: extracted.signal_category as SignalCategory,
            signalKey: extracted.signal_key,
            signalValue: extracted.value,
            confidence: extracted.confidence,
            version: 1,
          },
        });
      }
    }

    // Reload latest signals for progress tracking
    const latestSignals = await prisma.extractedSignal.findMany({
      where: {
        interviewSessionId: session.id,
        supersededById: null,
      },
    });

    const completionResult = checkCompletion(
      latestSignals.map((s: any) => ({
        signalKey: s.signalKey,
        signalCategory: s.signalCategory,
        confidence: s.confidence,
      }))
    );

    // Update session
    const updateData: Record<string, unknown> = {
      completionPercent: completionResult.completionPercent,
      lastActivityAt: new Date(),
      lastAnsweredPillar: aiResponse.current_pillar,
    };

    // Completion authority is backend-only.
    // The model can suggest completion through completion_candidate, but
    // official completion is decided by signal-based rules here.
    if (completionResult.isComplete) {
      const canAwait = validateTransition(
        'interview',
        InterviewSessionStatus.IN_PROGRESS,
        InterviewSessionStatus.AWAITING_VALIDATION
      );
      if (canAwait) {
        updateData.status = InterviewSessionStatus.AWAITING_VALIDATION;
        updateData.completionPercent = 100;

        // Immediately validate and complete
        const canComplete = validateTransition(
          'interview',
          InterviewSessionStatus.AWAITING_VALIDATION,
          InterviewSessionStatus.COMPLETED
        );
        if (canComplete) {
          updateData.status = InterviewSessionStatus.COMPLETED;
          updateData.lockedAt = new Date();
          updateData.completedAt = new Date();
        }
      }
    }

    await prisma.interviewSession.update({
      where: { id: session.id },
      data: updateData,
    });

    // On completion: build buyer-facing strategy, update workflow, send email
    let buyerStrategy: Record<string, unknown> | null = null;

    if (updateData.status === InterviewSessionStatus.COMPLETED) {
      // Update workflow
      if (session.client.clientWorkflow) {
        const canTransition = validateTransition(
          'workflow',
          session.client.clientWorkflow.status,
          WorkflowStatus.INTERVIEW_COMPLETE
        );
        if (canTransition) {
          await prisma.clientWorkflow.update({
            where: { id: session.client.clientWorkflow.id },
            data: { status: WorkflowStatus.INTERVIEW_COMPLETE },
          });
        }
      }

      // Auto-calculate buyer score on completion
      const categoryScores: Record<string, number[]> = {};
      for (const s of latestSignals) {
        if (!categoryScores[s.signalCategory]) {
          categoryScores[s.signalCategory] = [];
        }
        categoryScores[s.signalCategory].push(s.confidence * 100);
      }
      const avgCat = (cat: string) => {
        const vals = categoryScores[cat];
        if (!vals || vals.length === 0) return 50;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };

      const scores = calculateScore({
        motivationScore: avgCat(SignalCategory.BUYER_MOTIVATION),
        financialReadiness: avgCat(SignalCategory.FINANCIAL_READINESS),
        engagementScore: avgCat(SignalCategory.ENGAGEMENT),
        timelineScore: avgCat(SignalCategory.TIMELINE),
      });

      await prisma.scoringResult.upsert({
        where: { interviewSessionId: session.id },
        create: {
          interviewSessionId: session.id,
          motivationScore: scores.motivationScore,
          financialReadiness: scores.financialReadiness,
          engagementScore: scores.engagementScore,
          timelineScore: scores.timelineScore,
          buyerProbabilityScore: scores.buyerProbabilityScore,
          classification: scores.classification,
          inputSignalSnapshot: latestSignals.map((s: any) => ({
            signalKey: s.signalKey,
            signalCategory: s.signalCategory,
            signalValue: s.signalValue,
            confidence: s.confidence,
          })) as any,
        },
        update: {
          motivationScore: scores.motivationScore,
          financialReadiness: scores.financialReadiness,
          engagementScore: scores.engagementScore,
          timelineScore: scores.timelineScore,
          buyerProbabilityScore: scores.buyerProbabilityScore,
          classification: scores.classification,
          inputSignalSnapshot: latestSignals.map((s: any) => ({
            signalKey: s.signalKey,
            signalCategory: s.signalCategory,
            signalValue: s.signalValue,
            confidence: s.confidence,
          })) as any,
        },
      });

      // Build buyer-facing strategy from signals
      buyerStrategy = buildBuyerStrategy(latestSignals, session.client.name);

      // Load client + realtor info for email
      const clientData = await prisma.client.findUnique({
        where: { id: session.clientId },
        include: { realtor: { select: { name: true, email: true, phone: true, company: true } } },
      });

      if (clientData?.email) {
        sendCompletionEmail({
          buyerName: clientData.name,
          buyerEmail: clientData.email,
          strategy: buyerStrategy as any,
          realtorName: clientData.realtor.name,
          realtorEmail: clientData.realtor.email,
          realtorPhone: clientData.realtor.phone,
          realtorCompany: clientData.realtor.company,
        }).catch((err) => {
          console.error('Failed to send completion email:', err);
        });
      }
    }

    return reply.send({
      success: true,
      data: {
        reply: aiResponse.reply,
        completionPercent: completionResult.completionPercent,
        status: updateData.status ?? InterviewSessionStatus.IN_PROGRESS,
        signals_count: latestSignals.length,
        ...(buyerStrategy ? { buyerStrategy } : {}),
      },
    });
  });

  app.get('/interviews/:token/status', async (request, reply) => {
    const { token } = request.params as { token: string };

    const session = await prisma.interviewSession.findUnique({
      where: { token },
      select: { status: true, completionPercent: true },
    });

    if (!session) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Interview session not found' },
      });
    }

    return reply.send({
      success: true,
      data: {
        status: session.status,
        completionPercent: session.completionPercent,
      },
    });
  });
}
