import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { registerAuthDecorator } from './lib/auth';
import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import interviewRoutes from './routes/interviews';
import reportRoutes from './routes/reports';
import workflowRoutes from './routes/workflow';
import dashboardRoutes from './routes/dashboard';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string };
    user: { id: string; email: string };
  }
}

async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  });

  registerAuthDecorator(app);

  await app.register(authRoutes);
  await app.register(clientRoutes);
  await app.register(interviewRoutes);
  await app.register(reportRoutes);
  await app.register(workflowRoutes);
  await app.register(dashboardRoutes);

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error(error);

    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      success: false,
      error: {
        code: statusCode,
        message:
          statusCode === 500
            ? 'Internal server error'
            : error.message,
      },
    });
  });

  return app;
}

async function start() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { buildApp };
