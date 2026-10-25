import { builtinModules } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, "")),
);
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
    const file = join(directory, entry.name);
    return entry.isDirectory()
      ? sources(file)
      : /\.(?:[cm]?[jt]sx?|css)$/.test(file)
        ? [file]
        : [];
  });
}
function packageName(specifier: string) {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0]!;
}

it("each workspace declares the external packages its source imports", () => {
  const failures: string[] = [];
  for (const directory of [
    ".",
    "apps/backend",
    "apps/storefront",
    "packages/ui",
    "packages/i18n",
    "packages/shipping",
    "packages/contracts",
  ]) {
    const manifest = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    );
    const declared = new Set([
      manifest.name,
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const files =
      directory === "."
        ? [
            ...sources("scripts"),
            ...sources("tests"),
            ...readdirSync(".").filter((file) => /\.[cm]?[jt]s$/.test(file)),
          ]
        : sources(directory);
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      function check(specifier: string) {
        if (
          /^(?:\.|\/|node:|@\/|@shared-i18n\/)/.test(specifier) ||
          builtins.has(specifier)
        )
          return;
        if (!declared.has(packageName(specifier)))
          failures.push(`${file}: ${specifier}`);
      }
      if (file.endsWith(".css")) {
        for (const match of content.matchAll(/@import\s+["']([^"']+)["']/g))
          check(match[1]!);
        continue;
      }
      const tree = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          check(node.moduleSpecifier.text);
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          check(node.arguments[0].text);
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
  expect(failures, "Undeclared direct workspace dependencies").toEqual([]);
});
