import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma';
import {
  InterviewSessionStatus,
  ReportStatus,
  BuyerClassification,
} from '@bqp/shared';

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

    const result = clients.map((client) => {
      const session = client.interviewSessions[0] ?? null;
      const report = client.reports[0] ?? null;
      const scoring = session?.scoringResult ?? null;
      const reportData = report?.reportData as Record<string, any> | null;

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        leadSource: client.leadSource,
        createdAt: client.createdAt,
        workflowStatus: client.clientWorkflow?.status ?? 'NEW',
        recommendedAction: client.clientWorkflow?.recommendedAction ?? null,
        interviewStatus: session?.status ?? null,
        completionPercent: session?.completionPercent ?? 0,
        buyerScore: scoring?.buyerProbabilityScore ?? null,
        classification: scoring?.classification ?? null,
        scores: scoring ? {
          motivation: scoring.motivationScore,
          financial: scoring.financialReadiness,
          engagement: scoring.engagementScore,
          timeline: scoring.timelineScore,
        } : null,
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
