/** Called before connecting. Never load DATABASE_URL or .env as a fallback. */
export function assertFixtureTarget(connection: string, token: string) {
  let url: URL;
  try {
    url = new URL(connection);
  } catch {
    throw new Error("Invalid benchmark fixture target");
  }
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    !["25438", "25449"].includes(url.port) ||
    url.username !== "postgres" ||
    url.password !== "postgres" ||
    !/^\/supastore_cuj_[0-9]{13}$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      token,
    )
  )
    throw new Error("Invalid benchmark fixture target");
  return url.pathname.slice(1);
}
