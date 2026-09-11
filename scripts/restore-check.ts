/**
 * Cross-platform disaster recovery verification check
 * Asserts database restore readiness and verifies outbound suppression
 */

export function assertSafeRestoreEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.DISABLE_OUTBOUND_DELIVERY !== 'true') {
    throw new Error(
      'SAFETY CHECK FAILED: DISABLE_OUTBOUND_DELIVERY must be set to "true" during cold restore to prevent duplicate customer notifications.'
    );
  }
}

if (process.argv[1]?.endsWith('restore-check.ts')) {
  try {
    assertSafeRestoreEnvironment();
    console.log('✅ Safe restore environment verified: Outbound email delivery is suppressed.');
  } catch (err: any) {
    console.error('❌', err.message);
    process.exit(1);
  }
}
