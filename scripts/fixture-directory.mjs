import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export function fixtureDirectory(kind) {
  if (!["browser", "storefront", "integration"].includes(kind))
    throw new Error("Invalid fixture kind");
  const workspace = realpathSync(process.cwd());
  const requestedRoot = join(workspace, ".tmp-cuj");
  mkdirSync(requestedRoot, { recursive: true });
  const root = realpathSync(requestedRoot);
  if (root !== requestedRoot)
    throw new Error("Fixture root must not be a symbolic link");
  const path = mkdtempSync(join(root, `${kind}-postgres-`));
  return {
    path,
    cleanup() {
      if (dirname(resolve(path)) !== root)
        throw new Error("Unexpected fixture cleanup path");
      if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== root)
        throw new Error("Fixture root changed before cleanup");
      if (!existsSync(path)) return;
      if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
        throw new Error("Fixture directory changed before cleanup");
      rmSync(path, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      });
    },
  };
}
