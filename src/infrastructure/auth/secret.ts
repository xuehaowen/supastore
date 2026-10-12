export function authSecretFromEnvironment(env = process.env) {
  const secret = env.BETTER_AUTH_SECRET;
  if (
    env.NODE_ENV === "production" &&
    (!secret ||
      secret.length < 32 ||
      /^change-me|^build-only-placeholder/i.test(secret))
  )
    throw new Error(
      "BETTER_AUTH_SECRET must be a generated secret of at least 32 characters in production.",
    );
  return secret;
}
