import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import {
  validateTransition,
  calculateScore,
  determineAction,
  InterviewSessionStatus,
  ReportStatus,
  WorkflowStatus,
  BuyerClassification,
  SignalCategory,
} from '@bqp/shared';
import type {
  ScoringInput,
  QuickSnapshot,
  BuyerProfile,
  FinancialSnapshot,
  PropertyPreferences,
  RiskIndicator,
  ReportPayload,
  LenderSnapshot,
  FinancialClarity,
} from '@bqp/shared';

function getSignalValue(
  signals: Array<{ signalKey: string; signalValue: string; confidence: number }>,
  key: string
): string {
  const signal = signals.find((s) => s.signalKey === key);
  return signal?.signalValue ?? '';
}

function getSignalNumber(
  signals: Array<{ signalKey: string; signalValue: string; confidence: number }>,
  key: string,
  defaultValue: number
): number {
  const val = getSignalValue(signals, key);
  const num = parseFloat(val);
  return isNaN(num) ? defaultValue : num;
}

function deriveFinancialClarity(
  signals: Array<{ signalKey: string; signalValue: string; confidence: number }>
): FinancialClarity {
  const financialSignals = [
    'financing_intent',
    'financial_indicator',
    'budget_range',
    'preapproval_status',
    'down_payment',
  ];
  const found = financialSignals.filter((key) => getSignalValue(signals, key) !== '');
  if (found.length >= 4) return 'HIGH';
  if (found.length >= 2) return 'MEDIUM';
  return 'LOW';
}

function deriveRiskIndicators(
  signals: Array<{ signalKey: string; signalValue: string; confidence: number }>
): RiskIndicator[] {
  const risks: RiskIndicator[] = [];

  const financialClarity = deriveFinancialClarity(signals);
  if (financialClarity === 'LOW') {
    risks.push({
      indicator: 'Low Financial Clarity',
      severity: 'HIGH',
      detail: 'Buyer has provided very limited financial information.',
    });
  }

  const timeline = getSignalValue(signals, 'timeline');
  if (timeline && timeline.toLowerCase().includes('not sure')) {
    risks.push({
      indicator: 'Uncertain Timeline',
      severity: 'MEDIUM',
      detail: 'Buyer is uncertain about their purchase timeline.',
    });
  }

  const preapproval = getSignalValue(signals, 'preapproval_status');
  if (preapproval && preapproval.toLowerCase().includes('no')) {
    risks.push({
      indicator: 'No Pre-approval',
      severity: 'MEDIUM',
      detail: 'Buyer does not have mortgage pre-approval.',
    });
  }

  return risks;
}

function deriveTimelineMonths(
  signals: Array<{ signalKey: string; signalValue: string; confidence: number }>
): number {
  const timeline = getSignalValue(signals, 'timeline').toLowerCase();
  if (timeline.includes('immediate') || timeline.includes('asap')) return 1;
  if (timeline.includes('1 month') || timeline.includes('one month')) return 1;
  if (timeline.includes('3 month') || timeline.includes('three month')) return 3;
  if (timeline.includes('6 month') || timeline.includes('six month')) return 6;
  if (timeline.includes('year') || timeline.includes('12 month')) return 12;
  return 6; // default
}

export default async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/clients/:clientId/reports/generate', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { clientId } = request.params as { clientId: string };

    const client = await prisma.client.findFirst({
      where: { id: clientId, realtorId },
      include: {
        clientWorkflow: true,
        interviewSessions: {
          where: { status: InterviewSessionStatus.COMPLETED },
          orderBy: { completedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!client) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Client not found' },
      });
    }

    if (client.interviewSessions.length === 0) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 409,
          message: 'No completed interview session found for this client',
        },
      });
    }

    const session = client.interviewSessions[0];

    // Create report with PENDING status
    let report = await prisma.report.create({
      data: {
        clientId,
        status: ReportStatus.PENDING,
      },
    });

    // Transition to GENERATING
    const canGenerate = validateTransition(
      'report',
      ReportStatus.PENDING,
      ReportStatus.GENERATING
    );
    if (!canGenerate) {
      return reply.status(500).send({
        success: false,
        error: { code: 500, message: 'Failed to start report generation' },
      });
    }

    report = await prisma.report.update({
      where: { id: report.id },
      data: { status: ReportStatus.GENERATING },
    });

    // Get all latest signals
    const signals = await prisma.extractedSignal.findMany({
      where: {
        interviewSessionId: session.id,
        supersededById: null,
      },
    });

    const signalData = signals.map((s) => ({
      signalKey: s.signalKey,
      signalValue: s.signalValue,
      confidence: s.confidence,
      signalCategory: s.signalCategory,
    }));

    // Build scoring input from signals
    const scoringInput: ScoringInput = {
      motivationScore: getSignalNumber(signalData, 'motivation_score', 50),
      financialReadiness: getSignalNumber(signalData, 'financial_readiness_score', 50),
      engagementScore: getSignalNumber(signalData, 'engagement_score', 50),
      timelineScore: getSignalNumber(signalData, 'timeline_score', 50),
    };

    // Calculate derived scores from signal confidence and presence
    // Use signal confidence as a proxy for score when explicit scores aren't available
    const categoryScores: Record<string, number[]> = {};
    for (const s of signalData) {
      if (!categoryScores[s.signalCategory]) {
        categoryScores[s.signalCategory] = [];
      }
      categoryScores[s.signalCategory].push(s.confidence * 100);
    }

    const avgScore = (category: string) => {
      const scores = categoryScores[category];
      if (!scores || scores.length === 0) return 50;
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };

    // Override with derived scores if explicit ones not present
    if (!signalData.find((s) => s.signalKey === 'motivation_score')) {
      scoringInput.motivationScore = avgScore(SignalCategory.BUYER_MOTIVATION);
    }
    if (!signalData.find((s) => s.signalKey === 'financial_readiness_score')) {
      scoringInput.financialReadiness = avgScore(SignalCategory.FINANCIAL_READINESS);
    }
    if (!signalData.find((s) => s.signalKey === 'engagement_score')) {
      scoringInput.engagementScore = avgScore(SignalCategory.ENGAGEMENT);
    }
    if (!signalData.find((s) => s.signalKey === 'timeline_score')) {
      scoringInput.timelineScore = avgScore(SignalCategory.TIMELINE);
    }

    const scores = calculateScore(scoringInput);
    const riskIndicators = deriveRiskIndicators(signalData);

    const financialClarity = deriveFinancialClarity(signalData);
    const preapproval = getSignalValue(signalData, 'preapproval_status');
    const hasPreapproval =
      preapproval.toLowerCase().includes('yes') ||
      preapproval.toLowerCase().includes('approved');
    const timelineMonths = deriveTimelineMonths(signalData);

    const actionResult = determineAction({
      classification: scores.classification,
      buyerProbabilityScore: scores.buyerProbabilityScore,
      hasPreapproval,
      timelineMonths,
      riskIndicators: riskIndicators.map((r) => r.indicator),
      financialClarity,
      financialReadiness: scores.financialReadiness,
    });

    // Build report payload
    const quickSnapshot: QuickSnapshot = {
      buyerName: client.name,
      classification: scores.classification,
      score: scores.buyerProbabilityScore,
      recommendedAction: actionResult.action,
      topRisks: riskIndicators.map((r) => r.indicator),
    };

    const buyerProfile: BuyerProfile = {
      buyerType: getSignalValue(signalData, 'buyer_type') || 'Unknown',
      motivation: getSignalValue(signalData, 'motivation') || 'Not specified',
      timeline: getSignalValue(signalData, 'timeline') || 'Not specified',
      engagementLevel: scores.engagementScore >= 70
        ? 'High'
        : scores.engagementScore >= 40
          ? 'Medium'
          : 'Low',
    };

    const financialSnapshot: FinancialSnapshot = {
      budgetRange: getSignalValue(signalData, 'budget_range') || 'Not specified',
      preapproval: preapproval || 'Not specified',
      downPayment: getSignalValue(signalData, 'down_payment') || 'Not specified',
      financingIntent:
        getSignalValue(signalData, 'financing_intent') || 'Not specified',
      clarity: financialClarity,
    };

    const propertyPreferences: PropertyPreferences = {
      area: getSignalValue(signalData, 'target_area') || 'Not specified',
      type: getSignalValue(signalData, 'property_type') || 'Not specified',
      mustHaves: getSignalValue(signalData, 'must_haves')
        ? getSignalValue(signalData, 'must_haves')
            .split(',')
            .map((s) => s.trim())
        : [],
      dealBreakers: getSignalValue(signalData, 'deal_breakers')
        ? getSignalValue(signalData, 'deal_breakers')
            .split(',')
            .map((s) => s.trim())
        : [],
    };

    // Build summary text
    const summary = `${client.name} is a ${
      scores.classification === 'HIGH_PROBABILITY' ? 'highly motivated' :
      scores.classification === 'ACTIVE_BUYER' ? 'motivated' :
      scores.classification === 'EARLY_BUYER' ? 'early-stage' : 'research-phase'
    } ${buyerProfile.buyerType.toLowerCase()} buyer${
      buyerProfile.motivation !== 'Not specified' ? ` motivated by ${buyerProfile.motivation.toLowerCase()}` : ''
    }${
      buyerProfile.timeline !== 'Not specified' ? ` with a ${buyerProfile.timeline.toLowerCase()} timeline` : ''
    }. ${
      propertyPreferences.type !== 'Not specified'
        ? `Seeking a ${propertyPreferences.type.toLowerCase()} in ${propertyPreferences.area}`
        : 'Property preferences still being defined'
    }${
      financialSnapshot.budgetRange !== 'Not specified' ? ` around ${financialSnapshot.budgetRange}` : ''
    }.${
      financialSnapshot.financingIntent !== 'Not specified'
        ? ` Financing: ${financialSnapshot.financingIntent.toLowerCase()}.`
        : ''
    }`;

    // Build MLS criteria
    const mlsCriteria: Record<string, string> = {};
    if (propertyPreferences.type !== 'Not specified') mlsCriteria.property_type = propertyPreferences.type.toLowerCase();
    if (propertyPreferences.area !== 'Not specified') mlsCriteria.location = propertyPreferences.area;
    if (financialSnapshot.budgetRange !== 'Not specified') mlsCriteria.price_range = financialSnapshot.budgetRange;
    const bedrooms = getSignalValue(signalData, 'bedrooms');
    if (bedrooms) mlsCriteria.bedrooms = bedrooms;
    const bathrooms = getSignalValue(signalData, 'bathrooms');
    if (bathrooms) mlsCriteria.bathrooms = bathrooms;
    if (propertyPreferences.mustHaves.length > 0) mlsCriteria.features = propertyPreferences.mustHaves.join(', ');

    // Build consultation notes
    const consultationParts: string[] = [];
    if (buyerProfile.buyerType !== 'Unknown') consultationParts.push(`Buyer type: ${buyerProfile.buyerType}.`);
    if (buyerProfile.motivation !== 'Not specified') consultationParts.push(`Primary motivation: ${buyerProfile.motivation}.`);
    if (buyerProfile.timeline !== 'Not specified') consultationParts.push(`Timeline: ${buyerProfile.timeline}.`);
    if (financialSnapshot.preapproval !== 'Not specified') consultationParts.push(`Pre-approval: ${financialSnapshot.preapproval}.`);
    if (financialClarity === 'LOW') consultationParts.push('Financial clarity is low — needs lender referral for pre-qualification.');
    if (riskIndicators.length > 0) consultationParts.push(`Risk factors: ${riskIndicators.map(r => r.detail).join(' ')}`);
    if (propertyPreferences.dealBreakers.length > 0) consultationParts.push(`Deal breakers: ${propertyPreferences.dealBreakers.join(', ')}.`);
    consultationParts.push(`Recommended next step: ${actionResult.action.replace(/_/g, ' ').toLowerCase()}.`);
    const consultationNotes = consultationParts.join(' ');

    const reportPayload = {
      quickSnapshot,
      buyerProfile,
      financialSnapshot,
      propertyPreferences,
      scores,
      riskIndicators,
      aiRecommendation: actionResult,
      summary,
      mlsCriteria,
      consultationNotes,
      contactEmail: client.email,
      contactPhone: client.phone,
    };

    // Build lender snapshot
    const realtor = await prisma.realtor.findUnique({
      where: { id: realtorId },
    });

    const lenderSnapshot: LenderSnapshot = {
      buyerName: client.name,
      contactEmail: client.email ?? undefined,
      contactPhone: client.phone ?? undefined,
      financialSnapshot,
      propertyPreferences,
      timeline: buyerProfile.timeline,
      realtorName: realtor!.name,
      realtorEmail: realtor!.email,
      realtorPhone: realtor!.phone ?? undefined,
      realtorCompany: realtor!.company ?? undefined,
    };

    // Save scoring result
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
        inputSignalSnapshot: signalData as any,
      },
      update: {
        motivationScore: scores.motivationScore,
        financialReadiness: scores.financialReadiness,
        engagementScore: scores.engagementScore,
        timelineScore: scores.timelineScore,
        buyerProbabilityScore: scores.buyerProbabilityScore,
        classification: scores.classification,
        inputSignalSnapshot: signalData as any,
      },
    });

    // Update report to READY
    const canReady = validateTransition(
      'report',
      ReportStatus.GENERATING,
      ReportStatus.READY
    );
    if (!canReady) {
      return reply.status(500).send({
        success: false,
        error: { code: 500, message: 'Failed to finalize report' },
      });
    }

    report = await prisma.report.update({
      where: { id: report.id },
      data: {
        status: ReportStatus.READY,
        reportData: reportPayload as any,
        lenderSnapshot: lenderSnapshot as any,
        generatedAt: new Date(),
      },
    });

    // Update workflow
    if (client.clientWorkflow) {
      const canTransition = validateTransition(
        'workflow',
        client.clientWorkflow.status,
        WorkflowStatus.REPORT_READY
      );
      if (canTransition) {
        await prisma.clientWorkflow.update({
          where: { id: client.clientWorkflow.id },
          data: {
            status: WorkflowStatus.REPORT_READY,
            recommendedAction: actionResult.action,
          },
        });
      }
    }

    return reply.status(201).send({
      success: true,
      data: { report },
    });
  });

  app.get('/clients/:clientId/reports/:reportId', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { clientId, reportId } = request.params as {
      clientId: string;
      reportId: string;
    };

    const client = await prisma.client.findFirst({
      where: { id: clientId, realtorId },
    });

    if (!client) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Client not found' },
      });
    }

    const report = await prisma.report.findFirst({
      where: { id: reportId, clientId },
    });

    if (!report) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Report not found' },
      });
    }

    return reply.send({
      success: true,
      data: { report },
    });
  });

  app.get(
    '/clients/:clientId/reports/:reportId/lender-snapshot',
    async (request, reply) => {
      const { id: realtorId } = request.user as { id: string };
      const { clientId, reportId } = request.params as {
        clientId: string;
        reportId: string;
      };

      const client = await prisma.client.findFirst({
        where: { id: clientId, realtorId },
      });

      if (!client) {
        return reply.status(404).send({
          success: false,
          error: { code: 404, message: 'Client not found' },
        });
      }

      const report = await prisma.report.findFirst({
        where: { id: reportId, clientId },
      });

      if (!report) {
        return reply.status(404).send({
          success: false,
          error: { code: 404, message: 'Report not found' },
        });
      }

      if (!report.lenderSnapshot) {
        return reply.status(404).send({
          success: false,
          error: { code: 404, message: 'Lender snapshot not available' },
        });
      }

      return reply.send({
        success: true,
        data: { lenderSnapshot: report.lenderSnapshot },
      });
    }
  );
}
