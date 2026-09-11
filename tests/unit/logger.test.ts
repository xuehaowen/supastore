import { describe, it, expect, vi } from 'vitest';
import { sanitizePayload, logger } from '@/infrastructure/security/logger';

describe('Log Sanitizer', () => {
  it('redacts sensitive keys including passwords, secrets, tokens, and authorization', () => {
    const raw = {
      user: 'alice',
      password: 'SuperSecretPassword123!',
      apiKey: 'sk-live-1234567890',
      authToken: 'token-xyz',
      nested: {
        adminSecret: 'secret_value',
        orderId: 'ord_123',
      },
    };

    const sanitized = sanitizePayload(raw);

    expect(sanitized.user).toBe('alice');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.authToken).toBe('[REDACTED]');
    expect(sanitized.nested.adminSecret).toBe('[REDACTED]');
    expect(sanitized.nested.orderId).toBe('ord_123');
  });

  it('redacts JWT / Bearer tokens inside string values', () => {
    const raw = {
      header: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgN_p_placeholder',
    };

    const sanitized = sanitizePayload(raw);
    expect(sanitized.header).toBe('[REDACTED_TOKEN]');
  });

  it('logs JSON to console with sanitized data', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    logger.info('Checkout initiated', {
      orderId: 'ord_99',
      customerSecret: 'should_not_leak',
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const loggedString = infoSpy.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Checkout initiated');
    expect(parsed.data.orderId).toBe('ord_99');
    expect(parsed.data.customerSecret).toBe('[REDACTED]');

    infoSpy.mockRestore();
  });
});
