import { describe, it, expect } from 'vitest';
import { MockEmailAdapter } from '@/infrastructure/notifications/mock';

describe('Transactional Outbox Notification Worker', () => {
  it('records and verifies sent email deliveries via MockEmailAdapter', async () => {
    const mockAdapter = new MockEmailAdapter();

    const payload = {
      recipient: 'customer@example.com',
      subject: 'Notification: order.submitted',
      template: 'order.submitted',
      data: {
        orderId: 'order-123',
        referenceCode: 'SP-7K4M-9Q22K',
        purchaseTotalCents: 4500,
      },
    };

    const result = await mockAdapter.sendEmail(payload);

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();

    const sent = mockAdapter.getSentMessages();
    expect(sent.length).toBe(1);
    expect(sent[0]!.recipient).toBe('customer@example.com');
    expect(sent[0]!.data.referenceCode).toBe('SP-7K4M-9Q22K');

    mockAdapter.clear();
    expect(mockAdapter.getSentMessages().length).toBe(0);
  });
});
