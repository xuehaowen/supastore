import type { db } from '@/infrastructure/db';
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

