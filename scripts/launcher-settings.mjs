import { resolvePublicOrigin } from "../packages/config/public-origin.mjs";
import { resolveBackendOrigin } from "../packages/config/backend-origin.mjs";

/** Validate in-memory configuration; environment files are loaded upstream.
 * @param {string} command
 * @param {Record<string, string | undefined>} env
 */
export function launcherSettings(command, env = process.env) {
  return {
    publicOrigin: resolvePublicOrigin({
      ...env,
      NODE_ENV:
        command === "start"
          ? "production"
          : command === "build"
            ? "development"
            : env.NODE_ENV,
    }),
    backendUrl: resolveBackendOrigin({
      BACKEND_URL:
        env.BACKEND_URL || `http://127.0.0.1:${env.BACKEND_PORT || "3000"}`,
    }),
  };
}

/** Keep backend credentials out of the independent storefront process.
 * @param {Record<string, string | undefined>} env
 */
export function storefrontProcessEnvironment(env) {
  const allowed = new Set([
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "ComSpec",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "LANG",
    "LC_ALL",
    "TZ",
    "CI",
    "NODE_ENV",
    "NODE_OPTIONS",
    "PORT",
    "HOSTNAME",
    "NEXT_TELEMETRY_DISABLED",
    "NEXT_DIST_DIR",
    "STOREFRONT_TSCONFIG",
    "STANDALONE",
    "DOCKER_BUILD",
    "EDGE_PROXY_SECRET",
  ]);
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => allowed.has(key) || key.startsWith("NEXT_PUBLIC_"),
    ),
  );
}
