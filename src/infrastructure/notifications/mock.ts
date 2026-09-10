import type { EmailNotificationPayload, NotificationAdapter } from './adapter';

export class MockEmailAdapter implements NotificationAdapter {
  private sentMessages: EmailNotificationPayload[] = [];

  async sendEmail(payload: EmailNotificationPayload): Promise<{ success: boolean; messageId: string }> {
    this.sentMessages.push({ ...payload });
    return {
      success: true,
      messageId: `mock-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };
  }

  getSentMessages(): EmailNotificationPayload[] {
    return [...this.sentMessages];
  }

  clear(): void {
    this.sentMessages = [];
  }
}

export const mockEmailAdapter = new MockEmailAdapter();
