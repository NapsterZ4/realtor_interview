import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: any;

async function getApp() {
  if (!app) {
    const { buildApp } = await import('../packages/api/dist/index.js');
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const fastify = await getApp();

    // Strip /api prefix to match Fastify route registration
    const url = (req.url || '/').replace(/^\/api/, '') || '/';

    const response = await fastify.inject({
      method: req.method as any,
      url,
      headers: req.headers as any,
      payload: req.body != null ? JSON.stringify(req.body) : undefined,
    });

    // Forward response headers
    const headers = response.headers;
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && key !== 'transfer-encoding') {
        res.setHeader(key, value as string);
      }
    }

    res.status(response.statusCode).send(response.body);
  } catch (err: any) {
    console.error('Serverless handler error:', err);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Internal server error' },
    });
  }
}
