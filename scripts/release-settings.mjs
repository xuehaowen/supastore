import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function betaRelease(repository, tag) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(
      repository ?? "",
    )
  )
    throw new Error("Invalid release repository.");
  if (!/^v0\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.[1-9]\d*$/.test(tag ?? ""))
    throw new Error(
      "Use an existing developer-beta tag, such as v0.1.0-beta.1.",
    );
  return { tag, namespace: `ghcr.io/${repository.toLowerCase()}` };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const release = betaRelease(
    process.env.GITHUB_REPOSITORY,
    process.env.RELEASE_TAG,
  );
  if (!process.env.GITHUB_OUTPUT)
    throw new Error("Run from the release workflow.");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `tag=${release.tag}\nnamespace=${release.namespace}\n`,
  );
}
