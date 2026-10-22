/** Provision the trusted application's DML role using migration credentials.
 * @param {import("postgres").Sql} client
 * @param {{user: string, password: string}} config
 */
export async function provisionRuntimeRole(client, { user, password }) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user) || !password)
    throw new Error("Runtime database user and password are required");
  await client.begin(async (tx) => {
    const [identity] =
      await tx`SELECT current_user AS name, current_database() AS database`;
    if (identity.name === user)
      throw new Error("Runtime role must differ from the migration role");
    const owned =
      await tx`SELECT 1 FROM pg_roles role WHERE role.rolname = ${user}::text
      AND (EXISTS (SELECT 1 FROM pg_class WHERE relowner = role.oid AND relpersistence <> 't')
        OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = role.oid AND nspname !~ '^pg_(toast_)?temp_[0-9]+$')
        OR EXISTS (SELECT 1 FROM pg_database WHERE datdba = role.oid))`;
    if (owned.length)
      throw new Error("Runtime role must not own persistent database objects");
    const existing =
      await tx`SELECT rolname FROM pg_roles WHERE rolname = ${user}::text`;
    // PostgreSQL utility statements cannot parameterize identifiers/passwords.
    const [command] = await tx`SELECT format(
      ${existing.length ? "ALTER ROLE %I" : "CREATE ROLE %I"} ||
      ' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      ${user}::text, ${password}::text) AS statement`;
    await tx.unsafe(command.statement);
    const memberships =
      await tx`SELECT parent.rolname FROM pg_auth_members membership
      JOIN pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
      WHERE member.rolname = ${user}::text`;
    for (const membership of memberships) {
      const [revoke] =
        await tx`SELECT format('REVOKE %I FROM %I', ${membership.rolname}::text, ${user}::text) AS statement`;
      await tx.unsafe(revoke.statement);
    }
    // Dedicated store database: PUBLIC must not confer schema-creation rights.
    await tx.unsafe("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    const [reset] = await tx`SELECT format(
      'REVOKE ALL ON DATABASE %I FROM %I; '
      'REVOKE ALL ON SCHEMA drizzle FROM %I; REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM %I; '
      'REVOKE ALL ON SCHEMA public FROM %I; REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I; '
      'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I',
      ${identity.database}::text, ${user}::text, ${user}::text, ${user}::text, ${user}::text, ${user}::text, ${user}::text) AS statement`;
    await tx.unsafe(reset.statement);
    const [grants] = await tx`SELECT format(
      'GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I; GRANT USAGE ON SCHEMA public TO %I; '
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I; '
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',
      ${identity.database}::text, ${user}::text, ${user}::text, ${user}::text, ${user}::text) AS statement`;
    await tx.unsafe(grants.statement);
    const [queueSchema] =
      await tx`SELECT 1 FROM pg_namespace WHERE nspname='pgboss'`;
    if (queueSchema) {
      const [queueGrants] = await tx`SELECT format(
        'REVOKE ALL ON SCHEMA pgboss FROM %I; GRANT USAGE ON SCHEMA pgboss TO %I; '
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO %I; '
        'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO %I',
        ${user}::text, ${user}::text, ${user}::text, ${user}::text) AS statement`;
      await tx.unsafe(queueGrants.statement);
    }
  });
}
