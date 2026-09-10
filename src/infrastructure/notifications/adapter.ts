export interface EmailNotificationPayload {
  recipient: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

export interface NotificationAdapter {
  sendEmail(payload: EmailNotificationPayload): Promise<{ success: boolean; messageId?: string; error?: string }>;
}
