import { describe, it, expect } from 'vitest';
import { assertSafeRestoreEnvironment } from '@/../scripts/restore-check';

describe('Disaster Recovery Restore Check', () => {
  it('throws error when DISABLE_OUTBOUND_DELIVERY is not true', () => {
    expect(() => assertSafeRestoreEnvironment({} as any)).toThrow('DISABLE_OUTBOUND_DELIVERY');
    expect(() => assertSafeRestoreEnvironment({ DISABLE_OUTBOUND_DELIVERY: 'false' } as any)).toThrow(
      'DISABLE_OUTBOUND_DELIVERY'
    );
  });

  it('passes when DISABLE_OUTBOUND_DELIVERY is true', () => {
    expect(() =>
      assertSafeRestoreEnvironment({ DISABLE_OUTBOUND_DELIVERY: 'true' } as any)
    ).not.toThrow();
  });
});
