import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  leadSource: z.string().optional(),
  preferredLanguage: z.string().optional(),
  notes: z.string().optional(),
});

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  leadSource: z.string().optional(),
  preferredLanguage: z.string().optional(),
  notes: z.string().optional(),
});

export default async function clientRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/clients', async (request, reply) => {
    const parsed = createClientSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 400,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
      });
    }

    const { id: realtorId } = request.user as { id: string };
    const data = parsed.data;

    const client = await prisma.client.create({
      data: {
        realtorId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        leadSource: data.leadSource,
        preferredLanguage: data.preferredLanguage ?? 'en',
        notes: data.notes,
        clientWorkflow: {
          create: { status: 'NEW' },
        },
      },
      include: {
        clientWorkflow: true,
      },
    });

    return reply.status(201).send({
      success: true,
      data: { client },
    });
  });

  app.get('/clients', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };

    const clients = await prisma.client.findMany({
      where: { realtorId },
      include: {
        clientWorkflow: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: { clients },
    });
  });

  app.get('/clients/:id', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { id } = request.params as { id: string };

    const client = await prisma.client.findFirst({
      where: { id, realtorId },
      include: {
        clientWorkflow: true,
        interviewSessions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            token: true,
            status: true,
            completionPercent: true,
            startedAt: true,
            completedAt: true,
            expiresAt: true,
            createdAt: true,
            extractedSignals: {
              where: { supersededById: null },
              select: {
                signalKey: true,
                signalCategory: true,
                signalValue: true,
                confidence: true,
                version: true,
              },
            },
          },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            reportData: true,
            lenderSnapshot: true,
            generatedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!client) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Client not found' },
      });
    }

    return reply.send({
      success: true,
      data: { client },
    });
  });

  app.patch('/clients/:id', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { id } = request.params as { id: string };

    const parsed = updateClientSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 400,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
      });
    }

    const existing = await prisma.client.findFirst({
      where: { id, realtorId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Client not found' },
      });
    }

    const client = await prisma.client.update({
      where: { id },
      data: parsed.data,
      include: { clientWorkflow: true },
    });

    return reply.send({
      success: true,
      data: { client },
    });
  });
}
