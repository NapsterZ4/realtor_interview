import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { validateTransition, WorkflowStatus } from '@bqp/shared';

const executeSchema = z.object({
  actionNotes: z.string().optional(),
});

const setPipelineStatusSchema = z.object({
  status: z.enum(['SENT', 'ANSWERED', 'FOLLOW_UP', 'CLOSED']),
});

function mapPipelineStatusToWorkflowStatus(status: 'SENT' | 'ANSWERED' | 'FOLLOW_UP' | 'CLOSED'): WorkflowStatus {
  switch (status) {
    case 'FOLLOW_UP':
      return WorkflowStatus.FOLLOW_UP;
    case 'CLOSED':
      return WorkflowStatus.CLOSED;
    case 'ANSWERED':
      return WorkflowStatus.INTERVIEW_COMPLETE;
    default:
      return WorkflowStatus.INTERVIEW_SENT;
  }
}

export default async function workflowRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/clients/:clientId/workflow', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { clientId } = request.params as { clientId: string };

    const client = await prisma.client.findFirst({
      where: { id: clientId, realtorId },
    });

    if (!client) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Client not found' },
      });
    }

    const workflow = await prisma.clientWorkflow.findUnique({
      where: { clientId },
    });

    if (!workflow) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Workflow not found' },
      });
    }

    return reply.send({
      success: true,
      data: { workflow },
    });
  });

  app.post('/clients/:clientId/workflow/execute', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { clientId } = request.params as { clientId: string };

    const parsed = executeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 400,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
      });
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, realtorId },
    });

    if (!client) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Client not found' },
      });
    }

    const workflow = await prisma.clientWorkflow.findUnique({
      where: { clientId },
    });

    if (!workflow) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Workflow not found' },
      });
    }

    const canTransition = validateTransition(
      'workflow',
      workflow.status,
      WorkflowStatus.ACTION_TAKEN
    );

    if (!canTransition) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 409,
          message: `Cannot transition from ${workflow.status} to ACTION_TAKEN`,
        },
      });
    }

    const updated = await prisma.clientWorkflow.update({
      where: { clientId },
      data: {
        status: WorkflowStatus.ACTION_TAKEN,
        actionExecutedAt: new Date(),
        actionNotes: parsed.data.actionNotes ?? null,
      },
    });

    return reply.send({
      success: true,
      data: { workflow: updated },
    });
  });

  app.patch('/clients/:clientId/workflow/status', async (request, reply) => {
    const { id: realtorId } = request.user as { id: string };
    const { clientId } = request.params as { clientId: string };

    const parsed = setPipelineStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 400,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
      });
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, realtorId },
    });

    if (!client) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Client not found' },
      });
    }

    const workflow = await prisma.clientWorkflow.findUnique({
      where: { clientId },
    });

    if (!workflow) {
      return reply.status(404).send({
        success: false,
        error: { code: 404, message: 'Workflow not found' },
      });
    }

    const mapped = mapPipelineStatusToWorkflowStatus(parsed.data.status);
    const updated = await prisma.clientWorkflow.update({
      where: { clientId },
      data: {
        status: mapped,
      },
    });

    return reply.send({
      success: true,
      data: { workflow: updated },
    });
  });
}
