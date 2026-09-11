import nodemailer from "nodemailer";
import type { NotificationAdapter } from "./adapter";
export const smtpAdapter: NotificationAdapter = {
  async sendEmail(payload) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
    });
    const data = payload.data;
    const lines = [payload.subject];
    for (const key of [
      "referenceCode",
      "purchaseTotalCents",
      "receivedCents",
      "balanceCents",
      "recoveryUrl",
      "verificationUrl",
    ])
      if (data[key] !== undefined) lines.push(key + ": " + String(data[key]));
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: payload.recipient,
      subject: payload.subject,
      text: lines.join("\n"),
    });
    return { success: true, messageId: result.messageId };
  },
};
