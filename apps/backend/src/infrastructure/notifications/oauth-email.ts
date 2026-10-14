import {
  NodemailerEmailSender,
  type EmailTransportFactory,
} from "./nodemailer-email";
import type { OAuthEmailConfig } from "./provider-config";

/** Renewable OAuth SMTP authentication with the shared bounded send lifecycle. */
export class OAuthEmailSender extends NodemailerEmailSender {
  constructor(config: OAuthEmailConfig, factory?: EmailTransportFactory) {
    super(config, factory);
  }
}
