import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import {
  InterviewSessionStatus,
  ReportStatus,
  BuyerClassification,
  SignalCategory,
  calculateScore,
} from '@bqp/shared';

function computeScoreFromSignals(
  signals: Array<{ signalCategory: string; confidence: number }>
) {
  const categoryScores: Record<string, number[]> = {};
  for (const s of signals) {
    if (!categoryScores[s.signalCategory]) {
      categoryScores[s.signalCategory] = [];
    }
    categoryScores[s.signalCategory].push(s.confidence * 100);
  }
  const avg = (cat: string) => {
    const vals = categoryScores[cat];
    if (!vals || vals.length === 0) return 50;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  return calculateScore({
    motivationScore: avg(SignalCategory.BUYER_MOTIVATION),
    financialReadiness: avg(SignalCategory.FINANCIAL_READINESS),
    engagementScore: avg(SignalCategory.ENGAGEMENT),
    timelineScore: avg(SignalCategory.TIMELINE),
  });
}

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/dashboard/summary', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };

    const totalClients = await prisma.client.count({
      where: { realtorId },
    });

    const activeInterviews = await prisma.interviewSession.count({
      where: {
        client: { realtorId },
        status: InterviewSessionStatus.IN_PROGRESS,
      },
    });

    const reportsReady = await prisma.report.count({
      where: {
        client: { realtorId },
        status: ReportStatus.READY,
      },
    });

    const highPriority = await prisma.scoringResult.count({
      where: {
        interviewSession: {
          client: { realtorId },
        },
        classification: BuyerClassification.HIGH_PROBABILITY,
      },
    });

    return reply.send({
      success: true,
      data: {
        totalClients,
        activeInterviews,
        reportsReady,
        highPriority,
      },
    });
  });

  app.get('/dashboard/clients', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { status } = request.query as { status?: string };

    const where: Record<string, unknown> = { realtorId };

    if (status) {
      where.clientWorkflow = { status };
    }

    const clients = await prisma.client.findMany({
      where,
      include: {
        clientWorkflow: true,
        interviewSessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            token: true,
            status: true,
            completionPercent: true,
            createdAt: true,
            scoringResult: {
              select: {
                buyerProbabilityScore: true,
                classification: true,
                motivationScore: true,
                financialReadiness: true,
                engagementScore: true,
                timelineScore: true,
              },
            },
            extractedSignals: {
              where: { supersededById: null },
              select: {
                signalCategory: true,
                confidence: true,
              },
            },
          },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            reportData: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = clients.map((client: any) => {
      const session = client.interviewSessions[0] ?? null;
      const report = client.reports[0] ?? null;
      const scoring = session?.scoringResult ?? null;
      const reportData = report?.reportData as Record<string, any> | null;

      // Use saved scoring if available, otherwise compute live from signals
      let buyerScore: number | null = null;
      let classification: string | null = null;
      let scores: { motivation: number; financial: number; engagement: number; timeline: number } | null = null;

      if (scoring) {
        buyerScore = scoring.buyerProbabilityScore;
        classification = scoring.classification;
        scores = {
          motivation: scoring.motivationScore,
          financial: scoring.financialReadiness,
          engagement: scoring.engagementScore,
          timeline: scoring.timelineScore,
        };
      } else if (session?.extractedSignals && session.extractedSignals.length > 0) {
        // Compute live score from current signals
        const liveScores = computeScoreFromSignals(session.extractedSignals);
        buyerScore = liveScores.buyerProbabilityScore;
        classification = liveScores.classification;
        scores = {
          motivation: liveScores.motivationScore,
          financial: liveScores.financialReadiness,
          engagement: liveScores.engagementScore,
          timeline: liveScores.timelineScore,
        };
      }

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        leadSource: client.leadSource,
        createdAt: client.createdAt,
        workflowStatus: client.clientWorkflow?.status ?? 'NEW',
        recommendedAction: client.clientWorkflow?.recommendedAction ?? null,
        interviewToken: session?.token ?? null,
        interviewStatus: session?.status ?? null,
        completionPercent: session?.completionPercent ?? 0,
        buyerScore,
        classification,
        scores,
        summary: reportData?.summary ?? null,
        reportId: report?.id ?? null,
        reportStatus: report?.status ?? null,
      };
    });

    return reply.send({
      success: true,
      data: { clients: result },
    });
  });
}
