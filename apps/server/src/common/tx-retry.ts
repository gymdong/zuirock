import { Prisma } from '@prisma/client';

const RETRYABLE = new Set(['P1001', 'P1017']);

/**
 * Retries a result-recording transaction when the connection drops (Neon resume, plan §2.3(d)).
 * Safe because every write inside is idempotent. Up to 3 retries with exponential backoff.
 */
export async function withTxRetry<T>(run: () => Promise<T>, retries = 3, baseMs = 200): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : (error as { code?: string })?.code;
      if (attempt >= retries || !code || !RETRYABLE.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** attempt));
    }
  }
}
