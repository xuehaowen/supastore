import type { EmailSender } from "@/application/ports/notifications";
import {
  createAdapter,
  type ProfiledAdapterRegistry,
} from "../adapter-registry";
import {
  NodemailerEmailSender,
  type EmailTransportFactory,
} from "./nodemailer-email";
import { OAuthEmailSender } from "./oauth-email";
import type {
  EmailProviderConfig,
  NodemailerConfig,
  OAuthEmailConfig,
} from "./notification-config";
import { identity, nodemailerIdentity } from "./notification-config";
import { smtpRequiresTls } from "./smtp-settings.mjs";
import { parseSmtpConfig, validateSmtpConfig } from "./smtp-settings.mjs";

export const emailAdapters = Object.freeze({
  nodemailer: {
    handle: "nodemailer",
    parseEnvironment: (env) =>
      parseSmtpConfig(env, "nodemailer") as NodemailerConfig,
    validateConfig: validateSmtpConfig,
    configurationFingerprint: (config) =>
      identity("email-config", {
        identity: nodemailerIdentity(config),
        requireTls: smtpRequiresTls(config),
      }).profile,
    create: (config, factory) => new NodemailerEmailSender(config, factory),
  },
  "nodemailer-oauth2": {
    handle: "nodemailer-oauth2",
    parseEnvironment: (env) =>
      parseSmtpConfig(env, "nodemailer-oauth2") as OAuthEmailConfig,
    validateConfig: validateSmtpConfig,
    configurationFingerprint: (config) =>
      identity("email-config", {
        identity: nodemailerIdentity(config),
        requireTls: smtpRequiresTls(config),
      }).profile,
    create: (config, factory) => new OAuthEmailSender(config, factory),
  },
} satisfies ProfiledAdapterRegistry<
  EmailProviderConfig,
  EmailSender,
  EmailTransportFactory | undefined
>);

export function createEmailAdapter(
  config: EmailProviderConfig,
  factory?: EmailTransportFactory,
): EmailSender {
  return createAdapter<
    EmailProviderConfig,
    EmailSender,
    EmailTransportFactory | undefined
  >(emailAdapters, config, factory);
}
