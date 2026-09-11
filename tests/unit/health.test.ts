import { describe, it, expect, vi } from 'vitest';
import { GET as getLive } from '@/app/api/health/live/route';
import { GET as getReady } from '@/app/api/health/ready/route';
import { GET as getWorker } from '@/app/api/health/worker/route';
import { db } from '@/infrastructure/db';

describe('Health Endpoints', () => {
  it('/api/health/live returns 200 with status ok and uptime', async () => {
    const response = await getLive();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  it('/api/health/ready returns 200 when database executes successfully', async () => {
    vi.spyOn(db, 'execute').mockResolvedValueOnce([] as any);

    const response = await getReady();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ready');
    expect(body.database).toBe('connected');
  });

  it('/api/health/ready returns 503 when database throws error', async () => {
    vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('Connection terminated'));

    const response = await getReady();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('unhealthy');
    expect(body.database).toBe('disconnected');
    expect(body.error).toContain('Connection terminated');
  });

  it('/api/health/worker returns 200 with outbox metrics', async () => {
    vi.spyOn(db, 'execute')
      .mockResolvedValueOnce([
        { status: 'pending', count: 3 },
        { status: 'delivered', count: 15 },
      ] as any)
      .mockResolvedValueOnce([{ oldest_pending: new Date(Date.now() - 30_000).toISOString() }] as any);

    const response = await getWorker();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.outbox.pending).toBe(3);
    expect(body.outbox.delivered).toBe(15);
    expect(body.outbox.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(25);
  });
});
