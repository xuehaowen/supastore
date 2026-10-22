import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const bundled = require("next/dist/compiled/webpack/webpack");
bundled.init();
const webpack = bundled.webpack;

function serverExternals() {
  const source = ts.createSourceFile(
    "next.config.mjs",
    readFileSync("apps/backend/next.config.mjs", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let packages: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === "serverExternalPackages" &&
      ts.isArrayLiteralExpression(node.initializer)
    )
      packages = node.initializer.elements
        .filter(ts.isStringLiteral)
        .map((element) => element.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return packages;
}

async function compile(runtime: "edge" | "nodejs") {
  const directory = mkdtempSync(
    path.join(process.cwd(), ".tmp-instrumentation-"),
  );
  const compiler = webpack({
    mode: "development",
    devtool: false,
    target: runtime === "edge" ? "webworker" : "node",
    entry: path.resolve("apps/backend/src/instrumentation.ts"),
    output: { path: directory, filename: "instrumentation.js" },
    resolve: { extensions: [".ts", ".js", ".mjs", ".json"] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: path.resolve(
            "tests/fixtures/instrumentation-typescript-loader.cjs",
          ),
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.NEXT_RUNTIME": JSON.stringify(runtime),
      }),
    ],
    externals: [
      (
        { request }: { request?: string },
        callback: (error?: Error | null, result?: string) => void,
      ) => {
        // Isolate the real instrumentation -> queue client -> pg-boss -> pg import chain.
        if (
          request?.startsWith("@/") ||
          request === "drizzle-orm" ||
          request?.includes("infrastructure/runtime/shutdown") ||
          request?.includes("infrastructure/bootstrap/notification-providers")
        )
          return callback(null, `commonjs ${request}`);
        if (runtime === "nodejs" && serverExternals().includes(request ?? ""))
          return callback(null, `commonjs ${request}`);
        callback();
      },
    ],
  });
  try {
    return await new Promise<{
      errors: { message: string }[];
      warnings: { message: string }[];
      modules: { name?: string }[];
    }>((resolve, reject) => {
      compiler.run(
        (
          error: Error | null,
          stats: { toJson(options: object): unknown } | undefined,
        ) => {
          if (error) reject(error);
          else
            resolve(
              stats!.toJson({
                all: false,
                errors: true,
                warnings: true,
                modules: true,
              }) as never,
            );
        },
      );
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      compiler.close((error?: Error) => (error ? reject(error) : resolve())),
    );
    if (path.dirname(directory) !== process.cwd())
      throw new Error("Unexpected compiler output directory.");
    rmSync(directory, { recursive: true, force: true });
  }
}

it("excludes the PostgreSQL queue from Edge instrumentation", async () => {
  const stats = await compile("edge");
  expect(stats.errors.map((error) => error.message)).toEqual([]);
  expect(stats.modules.some((module) => module.name?.includes("pg-boss"))).toBe(
    false,
  );
}, 20000);

it("loads pg-boss natively in Node instrumentation without bundling optional pg-native", async () => {
  const stats = await compile("nodejs");
  expect(stats.errors.map((error) => error.message)).toEqual([]);
  expect(stats.warnings.map((warning) => warning.message)).toEqual([]);
  expect(
    stats.modules.some((module) => module.name === 'external "pg-boss"'),
  ).toBe(true);
  expect(
    stats.modules.some((module) => module.name?.includes("pg-boss/dist/")),
  ).toBe(false);
}, 20000);
