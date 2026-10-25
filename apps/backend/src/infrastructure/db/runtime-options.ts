type Environment = Record<string, string | undefined>;

/** Resource budgets apply to application sessions, independently of migration jobs. */
export function runtimeDatabaseOptions(env: Environment = process.env) {
  const setting = (
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ) => {
    const raw = env[name];
    const value =
      raw === undefined ? fallback : /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new Error(
        `${name} must be an integer between ${minimum} and ${maximum}.`,
      );
    return value;
  };
  const statement = setting("DB_STATEMENT_TIMEOUT_MS", 30000, 1000, 300000);
  const lock = setting("DB_LOCK_TIMEOUT_MS", 5000, 100, 300000);
  if (lock > statement)
    throw new Error(
      "DB_LOCK_TIMEOUT_MS must not exceed DB_STATEMENT_TIMEOUT_MS.",
    );
  return {
    max: setting("DB_POOL_MAX", 10, 1, 20),
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      application_name: "supastore",
      statement_timeout: statement,
      lock_timeout: lock,
      idle_in_transaction_session_timeout: setting(
        "DB_IDLE_TRANSACTION_TIMEOUT_MS",
        60000,
        1000,
        300000,
      ),
    },
  };
}
