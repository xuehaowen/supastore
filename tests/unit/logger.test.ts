import { describe, it, expect } from 'vitest';
import {
  createLogger,
  createMemoryLogSink,
  sanitizePayload,
} from '@/infrastructure/security/logger';

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
    const sink = createMemoryLogSink();
    const testLogger = createLogger({ sinks: [sink] });

    testLogger.info('Checkout initiated', {
      orderId: 'ord_99',
      customerSecret: 'should_not_leak',
    });

    const parsed = sink.entries()[0];

    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Checkout initiated');
    expect((parsed.data as Record<string, unknown>).orderId).toBe('ord_99');
    expect((parsed.data as Record<string, unknown>).customerSecret).toBe('[REDACTED]');
  });
});

describe('Log infrastructure', () => {
  it('supports a bounded in-memory sink for an enhanced log panel', () => {
    const sink = createMemoryLogSink(2);
    const panelLogger = createLogger({ sinks: [sink], level: 'debug' });

    panelLogger.info('first', { orderId: 'ord_1' });
    panelLogger.debug('second');
    panelLogger.warn('third');

    expect(sink.entries()).toHaveLength(2);
    expect(sink.entries().map((entry) => entry.message)).toEqual(['second', 'third']);
    expect(sink.entries()[0].data).toBeUndefined();
  });

  it('filters entries below the configured level', () => {
    const sink = createMemoryLogSink();
    const panelLogger = createLogger({ sinks: [sink], level: 'warn' });

    panelLogger.info('ignored');
    panelLogger.warn('visible');
    panelLogger.error('also visible');

    expect(sink.entries().map((entry) => entry.message)).toEqual([
      'visible',
      'also visible',
    ]);
  });

  it('keeps context and redacts sink payloads', () => {
    const sink = createMemoryLogSink();
    const panelLogger = createLogger({
      sinks: [sink],
      level: 'debug',
      context: { requestId: 'req_1', operation: 'checkout.create' },
    });

    panelLogger.info('failed', { password: 'secret', orderId: 'ord_2' });

    expect(sink.entries()[0]).toMatchObject({
      requestId: 'req_1',
      operation: 'checkout.create',
      data: { password: '[REDACTED]', orderId: 'ord_2' },
    });
  });
});
