import nodemailer from "nodemailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import type Mail from "nodemailer/lib/mailer";
import { createHash } from "node:crypto";
import type {
  EmailMessage,
  EmailSender,
  SendResult,
} from "@/application/ports/notifications";
import {
  mailbox,
  nodemailerIdentity,
  smtpRequiresTls,
  validMailbox,
  validateNotificationConfig,
  type NodemailerConfig,
} from "./provider-config";
import { smtpFailure } from "./provider-errors";
export interface EmailTransport {
  sendMail(
    options: Mail.Options,
  ): Promise<{
    accepted?: (string | { address: string })[];
    rejected?: unknown[];
    messageId?: string;
  }>;
  close(): void;
}
export type EmailTransportFactory = (
  options: SMTPPool.Options,
) => EmailTransport;
export const SMTP_SEND_DEADLINE_MS = 30000;
export const SMTP_MAX_PENDING = 8;
export const SMTP_RECOVERY_COOLDOWN_MS = 30000;
type PoolGeneration = { transport: EmailTransport; closed: boolean };
export class NodemailerEmailSender implements EmailSender {
  readonly identity;
  readonly capabilities = Object.freeze({ deliveryTracking: false });
  readonly #factory: EmailTransportFactory;
  readonly #options: SMTPPool.Options;
  #current: PoolGeneration | undefined;
  readonly #from: string;
  #closed = false;
  #recoverAt = 0;
  #pending = 0;
  constructor(
    config: NodemailerConfig,
    factory: EmailTransportFactory = (options) =>
      nodemailer.createTransport(options),
  ) {
    validateNotificationConfig({ email: config });
    this.identity = nodemailerIdentity(config);
    this.#from = config.from;
    this.#factory = factory;
    this.#options = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      requireTLS: smtpRequiresTls(config),
      ...(config.user
        ? { auth: { user: config.user, pass: config.password! } }
        : {}),
      disableFileAccess: true,
      disableUrlAccess: true,
    };
    this.#current = this.#newGeneration();
  }
  async send(message: EmailMessage): Promise<SendResult> {
    if (this.#closed)
      return { status: "rejected", code: "SMTP_CLOSED", retryable: false };
    if (Date.now() < this.#recoverAt)
      return {
        status: "rejected",
        code: "SMTP_CIRCUIT_OPEN",
        retryable: true,
        retryAfterMs: this.#recoverAt - Date.now(),
      };
    if (this.#pending >= SMTP_MAX_PENDING)
      return {
        status: "rejected",
        code: "SMTP_QUEUE_FULL",
        retryable: true,
        retryAfterMs: 5000,
      };
    if (
      !validMailbox(message.to) ||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(message.deliveryId) ||
      !message.subject ||
      message.subject.length > 998 ||
      /[\r\n]/.test(message.subject) ||
      message.text.length > 1048576 ||
      (message.html?.length ?? 0) > 1048576
    )
      return { status: "rejected", code: "EMAIL_INVALID", retryable: false };
    // New calls may rebuild after cooldown; the dispatcher retains unknown deliveries
    // for reconciliation. This non-idempotent adapter never replays a message internally.
    let generation: PoolGeneration;
    try {
      generation = this.#current ??= this.#newGeneration();
    } catch {
      this.#recoverAt = Date.now() + SMTP_RECOVERY_COOLDOWN_MS;
      return {
        status: "rejected",
        code: "SMTP_UNAVAILABLE",
        retryable: true,
        retryAfterMs: SMTP_RECOVERY_COOLDOWN_MS,
      };
    }
    const messageId = `<${createHash("sha256").update(message.deliveryId).digest("hex")}.${this.identity.profile.slice(0, 16)}@${mailbox(this.#from).split("@")[1]}>`;
    this.#pending++;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const submitted = generation.transport
        .sendMail({
          from: this.#from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html === undefined ? {} : { html: message.html }),
          messageId,
          disableFileAccess: true,
          disableUrlAccess: true,
        })
        .then((result): SendResult => {
          if (generation.closed)
            return { status: "unknown", code: "SMTP_GENERATION_UNKNOWN" };
          const accepted = result.accepted?.some(
            (recipient) =>
              (typeof recipient === "string"
                ? recipient
                : recipient.address
              ).toLowerCase() === message.to.toLowerCase(),
          );
          if (!accepted)
            return result.rejected?.length
              ? {
                  status: "rejected",
                  code: "SMTP_RECIPIENT_REJECTED",
                  retryable: false,
                }
              : { status: "unknown", code: "SMTP_ACCEPTANCE_UNKNOWN" };
          return {
            status: "accepted",
            providerMessageId: result.messageId || messageId,
          };
        })
        .catch((error) =>
          generation.closed
            ? ({
                status: "unknown",
                code: "SMTP_GENERATION_UNKNOWN",
              } as SendResult)
            : smtpFailure(error),
        );
      const timedOut = new Promise<SendResult>((resolve) => {
        deadline = setTimeout(() => {
          if (this.#current === generation) {
            this.#current = undefined;
            this.#recoverAt = Date.now() + SMTP_RECOVERY_COOLDOWN_MS;
          }
          // Provider acceptance may already have happened; closing is not a delivery rollback.
          resolve({ status: "unknown", code: "SMTP_DEADLINE_UNKNOWN" });
          this.#stopTransport(generation);
        }, SMTP_SEND_DEADLINE_MS);
      });
      return await Promise.race([submitted, timedOut]);
    } catch (error) {
      return smtpFailure(error);
    } finally {
      if (deadline) clearTimeout(deadline);
      this.#pending--;
    }
  }
  #newGeneration(): PoolGeneration {
    return {
      transport: this.#factory({
        ...this.#options,
        ...(this.#options.auth ? { auth: { ...this.#options.auth } } : {}),
      }),
      closed: false,
    };
  }
  #stopTransport(generation: PoolGeneration) {
    if (!generation.closed) {
      generation.closed = true;
      try {
        generation.transport.close();
      } catch {}
    }
  }
  close() {
    this.#closed = true;
    const current = this.#current;
    this.#current = undefined;
    if (current) this.#stopTransport(current);
  }
}
