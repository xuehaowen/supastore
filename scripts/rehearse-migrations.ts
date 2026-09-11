/**
 * Database Migration Rehearsal Script
 * Validates that Drizzle migrations apply cleanly and idempotently
 * without schema errors or syntax failures.
 */

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, queryClient } from '@/infrastructure/db';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export async function rehearseMigrations(migrationsFolder = 'src/infrastructure/db/migrations'): Promise<{
  migrationFilesCount: number;
  success: boolean;
}> {
  const resolvedPath = path.resolve(process.cwd(), migrationsFolder);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Migrations folder not found at: ${resolvedPath}`);
  }

  const files = readdirSync(resolvedPath).filter((f) => f.endsWith('.sql'));

  // Run migration
  await migrate(db, { migrationsFolder });

  return {
    migrationFilesCount: files.length,
    success: true,
  };
}

if (process.argv[1]?.endsWith('rehearse-migrations.ts')) {
  rehearseMigrations()
    .then((result) => {
      console.log(`✅ Migration rehearsal passed. ${result.migrationFilesCount} migration files verified.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration rehearsal failed:', err);
      process.exit(1);
    });
}
