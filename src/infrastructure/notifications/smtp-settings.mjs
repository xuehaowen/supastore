export class NotificationConfigurationError extends Error {
  constructor(field) {
    super(`Invalid notification configuration: ${field}.`);
    this.name = "NotificationConfigurationError";
  }
}
function required(env, field) {
  if (!env[field]) throw new NotificationConfigurationError(field);
  return env[field];
}
/** @param {string} value */
function validMailbox(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value) &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
export const smtpDefinitions = Object.freeze({
  nodemailer: {
    handle: "nodemailer",
    credentials: (env) => ({
      provider: "nodemailer",
      ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
      ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
    }),
    validate: (config) => {
      if (
        (config.user && !config.password) ||
        (!config.user && config.password) ||
        /[\r\n]/.test(config.user ?? "")
      )
        throw new NotificationConfigurationError("SMTP_AUTH");
    },
    authentication: (config) =>
      config.user ? { user: config.user, pass: config.password } : undefined,
  },
  "nodemailer-oauth2": {
    handle: "nodemailer-oauth2",
    credentials: (env) => ({
      provider: "nodemailer-oauth2",
      user: required(env, "SMTP_USER"),
      clientId: required(env, "SMTP_OAUTH_CLIENT_ID"),
      clientSecret: required(env, "SMTP_OAUTH_CLIENT_SECRET"),
      refreshToken: required(env, "SMTP_OAUTH_REFRESH_TOKEN"),
    }),
    validate: (config) => {
      if (!validMailbox(config.user))
        throw new NotificationConfigurationError("SMTP_USER");
      for (const [field, value] of [
        ["SMTP_OAUTH_CLIENT_ID", config.clientId],
        ["SMTP_OAUTH_CLIENT_SECRET", config.clientSecret],
        ["SMTP_OAUTH_REFRESH_TOKEN", config.refreshToken],
      ]) {
        if (
          typeof value !== "string" ||
          !value ||
          value.length > 4096 ||
          !/^[\x21-\x7e]+$/.test(value)
        )
          throw new NotificationConfigurationError(field);
      }
      if (!config.secure && !smtpRequiresTls(config))
        throw new NotificationConfigurationError("SMTP_REQUIRE_TLS");
    },
    authentication: (config) => ({
      type: "OAuth2",
      user: config.user,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
    }),
  },
});
function definition(handle) {
  if (!Object.hasOwn(smtpDefinitions, handle))
    throw new NotificationConfigurationError("EMAIL_PROVIDER");
  return smtpDefinitions[handle];
}
/** @param {import('./notification-config').SmtpProviderConfig} config */
export function smtpRequiresTls(config) {
  return (
    config.requireTls ??
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      config.host.toLowerCase(),
    )
  );
}
/** @param {import('./notification-config').SmtpProviderConfig} config */
export function validateSmtpConfig(config) {
  const adapter = definition(config.provider);
  if (!/^[A-Za-z0-9.:[\]-]{1,253}$/.test(config.host))
    throw new NotificationConfigurationError("SMTP_HOST");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new NotificationConfigurationError("SMTP_PORT");
  if (typeof config.secure !== "boolean")
    throw new NotificationConfigurationError("SMTP_SECURE");
  if (config.requireTls !== undefined && typeof config.requireTls !== "boolean")
    throw new NotificationConfigurationError("SMTP_REQUIRE_TLS");
  const from =
    /^([^<>\r\n]{1,100})<([^<>]+)>$/.exec(config.from)?.[2]?.trim() ??
    config.from;
  if (
    typeof config.from !== "string" ||
    config.from.length > 400 ||
    /[\x00-\x1f\x7f]/.test(config.from) ||
    !validMailbox(from)
  )
    throw new NotificationConfigurationError("SMTP_FROM");
  adapter.validate(config);
}
/** @param {Readonly<Record<string, string | undefined>>} env
 * @param {string} handle
 * @returns {import('./notification-config').SmtpProviderConfig}
 */
export function parseSmtpConfig(env, handle) {
  for (const field of ["SMTP_SECURE", "SMTP_REQUIRE_TLS"]) {
    if (env[field] !== undefined && !["true", "false"].includes(env[field]))
      throw new NotificationConfigurationError(field);
  }
  const port = Number(env.SMTP_PORT ?? 587);
  const config = {
    host: required(env, "SMTP_HOST"),
    port,
    secure:
      env.SMTP_SECURE === undefined ? port === 465 : env.SMTP_SECURE === "true",
    from: required(env, "SMTP_FROM"),
    ...(env.SMTP_REQUIRE_TLS === undefined
      ? {}
      : { requireTls: env.SMTP_REQUIRE_TLS === "true" }),
    ...definition(handle).credentials(env),
  };
  validateSmtpConfig(config);
  return config;
}
/** @param {import('./notification-config').SmtpProviderConfig} config
 * @returns {import('nodemailer/lib/smtp-pool').Options['auth']}
 */
export function emailAuthentication(config) {
  return definition(config.provider).authentication(config);
}
