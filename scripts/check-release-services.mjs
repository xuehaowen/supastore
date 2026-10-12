import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import nodemailer from "nodemailer";
import {
  parseSmtpConfig,
  emailAuthentication,
  smtpRequiresTls,
} from "../src/infrastructure/notifications/smtp-settings.mjs";

// Read-only probes: no payment, notification, database mutation or secret output.
/** @param {Record<string, string | undefined>} env
 * @param {{ connect?: boolean, fetcher?: typeof fetch, transportFactory?: (options: object) => { verify(): Promise<unknown>, close(): void } }} options
 */
export async function checkReleaseServices(
  env,
  {
    connect = false,
    fetcher = fetch,
    transportFactory = (options) => nodemailer.createTransport(options),
  } = {},
) {
  /** @type {Array<{service: string, configured: boolean, mode?: string, connection: string, failureCode?: string}>} */
  const results = [];
  const stripeConfigured = Boolean(
    env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET,
  );
  results.push({
    service: "stripe",
    configured: stripeConfigured,
    mode: env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
      ? "test"
      : env.STRIPE_SECRET_KEY
        ? "live"
        : "absent",
    connection: "not checked",
  });
  if (connect && stripeConfigured) {
    try {
      const response = await fetcher("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(10000),
      });
      results[0].connection = response.ok
        ? "authenticated"
        : "authentication failed";
    } catch {
      results[0].connection = "unreachable";
    }
  }
  const emailProvider =
    env.EMAIL_PROVIDER ?? (env.SMTP_HOST ? "nodemailer" : "disabled");
  let emailConfig;
  if (emailProvider !== "disabled") {
    try {
      emailConfig = parseSmtpConfig(env, emailProvider);
    } catch {
      /* Report missing/invalid config without exposing credentials. */
    }
  }
  const smtpConfigured = Boolean(emailConfig);
  results.push({
    service: "smtp",
    configured: smtpConfigured,
    mode: emailProvider,
    connection: "not checked",
  });
  if (connect && emailConfig) {
    const auth = emailAuthentication(emailConfig);
    const transport = transportFactory({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      requireTLS: smtpRequiresTls(emailConfig),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      ...(auth ? { auth } : {}),
    });
    let timeout;
    try {
      await Promise.race([
        transport.verify(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Probe timeout")), 15000);
        }),
      ]);
      results[1].connection = "authenticated";
    } catch (error) {
      results[1].connection = "connection/authentication failed";
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "TIMEOUT";
      results[1].failureCode = /^[A-Z]{1,20}$/.test(code)
        ? code
        : "PROBE_FAILED";
    } finally {
      clearTimeout(timeout);
      transport.close();
    }
  }
  results.push({
    service: "sms",
    configured:
      env.SMS_PROVIDER === "telnyx" &&
      Boolean(
        env.TELNYX_API_KEY &&
        env.TELNYX_FROM &&
        env.TELNYX_MESSAGING_PROFILE_ID,
      ),
    mode: "sending disabled",
    connection: "not checked",
  });
  return results;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const results = await checkReleaseServices(process.env, {
    connect: process.argv.includes("--connect"),
  });
  const exitCode = results.some(
    (result) =>
      result.connection === "authentication failed" ||
      result.connection === "unreachable" ||
      result.connection === "connection/authentication failed",
  )
    ? 1
    : 0;
  // A blocked DNS resolver can retain sockets after the probe deadline.
  process.stdout.write(
    JSON.stringify({ readOnly: true, results }, null, 2) + "\n",
    () => process.exit(exitCode),
  );
}
