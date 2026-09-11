import { describe, it, expect } from 'vitest';
import { rehearseMigrations } from '@/../scripts/rehearse-migrations';

const enabled = !!process.env.DATABASE_URL?.includes('supastore');

describe.skipIf(!enabled)('Database Migration Rehearsal', () => {
  it('runs all forward migrations cleanly and idempotently', async () => {
    const result = await rehearseMigrations();
    expect(result.success).toBe(true);
    expect(result.migrationFilesCount).toBeGreaterThan(0);
  });
});
