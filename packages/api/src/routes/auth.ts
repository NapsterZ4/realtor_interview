import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { hashPassword, comparePassword } from '../lib/auth';

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  company: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

function sanitizeRealtor(realtor: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  company: string | null;
  createdAt: Date;
}) {
  return {
    id: realtor.id,
    email: realtor.email,
    name: realtor.name,
    phone: realtor.phone,
    company: realtor.company,
    createdAt: realtor.createdAt,
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 400,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
      });
    }

    const { email, password, name, phone, company } = parsed.data;

    const existing = await prisma.realtor.findUnique({ where: { email } });
    if (existing) {
      return reply.status(400).send({
        success: false,
        error: { code: 400, message: 'Email already registered' },
      });
    }

    const passwordHash = await hashPassword(password);

    const realtor = await prisma.realtor.create({
      data: { email, passwordHash, name, phone, company },
    });

    const token = app.jwt.sign({ id: realtor.id, email: realtor.email });

    return reply.status(201).send({
      success: true,
      data: { token, user: sanitizeRealtor(realtor) },
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 400,
          message: parsed.error.issues.map((i) => i.message).join(', '),
        },
      });
    }

    const { email, password } = parsed.data;

    const realtor = await prisma.realtor.findUnique({ where: { email } });
    if (!realtor) {
      return reply.status(401).send({
        success: false,
        error: { code: 401, message: 'Invalid email or password' },
      });
    }

    const valid = await comparePassword(password, realtor.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        success: false,
        error: { code: 401, message: 'Invalid email or password' },
      });
    }

    const token = app.jwt.sign({ id: realtor.id, email: realtor.email });

    return reply.send({
      success: true,
      data: { token, user: sanitizeRealtor(realtor) },
    });
  });

  app.get(
    '/auth/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.user as { id: string; email: string };

      const realtor = await prisma.realtor.findUnique({ where: { id } });
      if (!realtor) {
        return reply.status(404).send({
          success: false,
          error: { code: 404, message: 'User not found' },
        });
      }

      return reply.send({
        success: true,
        data: { user: sanitizeRealtor(realtor) },
      });
    }
  );
}
