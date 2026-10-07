/** @deprecated Compatibility input for existing auth hooks; new workflows use application ports. */
export interface EmailNotificationPayload {
  recipient: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export interface NotificationAdapter {
  sendEmail(
    payload: EmailNotificationPayload,
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}
