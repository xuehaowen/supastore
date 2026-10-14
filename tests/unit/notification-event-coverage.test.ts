import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import {
  notificationEvents,
  requiredTemplates,
} from "@/application/notifications/templates";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(directory, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(directory, entry.name)]
        : [],
  );
}
it("every literal application notification event is registered and seeded in the migration", () => {
  const emitted = new Set<string>();
  for (const file of [
    ...sources("apps/backend/src/application"),
    ...sources("apps/backend/src/infrastructure/auth"),
  ]) {
    const tree = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "emitOrderEvent" &&
        node.arguments[2] &&
        ts.isStringLiteral(node.arguments[2])
      )
        emitted.add(node.arguments[2].text);
      if (
        ts.isPropertyAssignment(node) &&
        ["eventType", "template"].includes(node.name.getText(tree)) &&
        ts.isStringLiteral(node.initializer)
      )
        emitted.add(node.initializer.text);
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  expect(emitted.size).toBeGreaterThan(10);
  for (const event of emitted)
    expect(
      notificationEvents[event],
      `Register templates for ${event}`,
    ).toBeTruthy();
  const migration = readFileSync(
    "apps/backend/src/infrastructure/db/migrations/0036_notification_templates.sql",
    "utf8",
  );
  for (const key of requiredTemplates())
    expect(migration).toContain(
      `('${key.event}','${key.channel}','${key.audience}','${key.locale}',`,
    );
});
