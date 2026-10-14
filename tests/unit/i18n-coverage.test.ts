import { describe, expect, it } from "vitest";
import { messages } from "@supastore/i18n/messages";
import { storefrontMessages } from "../../apps/storefront/lib/i18n";
import {
  customerError,
  formatLocalDate,
  formatMoney,
  localeFromPath,
  statusLabel,
  sharedMessages,
  activityLabel,
} from "../../packages/i18n/src/customer";
import { stateOptions } from "@supastore/shipping/destination";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      typeof item === "string"
        ? [[prefix + key, item]]
        : Object.entries(leaves(item, prefix + key + ".")),
    ),
  );
}
describe("complete customer locale resources", () => {
  for (const [name, catalogs] of [
    ["main", messages],
    ["separate", storefrontMessages],
  ] as const) {
    it(`${name} has matching nonempty English/Chinese keys and interpolation variables`, () => {
      const en = leaves(catalogs.en),
        zh = leaves(catalogs.zh);
      expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        expect(text.trim(), key).not.toBe("");
        expect(zh[key]?.trim(), key).not.toBe("");
        expect(
          [...zh[key]!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
          key,
        ).toEqual([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
      }
    });
  }
  it("all translated API errors and statuses resolve in Chinese without raw English", () => {
    for (const [key, english] of Object.entries(sharedMessages.en.errors))
      expect(customerError(new Error(english), "zh"), key).toBe(
        (sharedMessages.zh.errors as Record<string, string>)[key],
      );
    for (const [key, chinese] of Object.entries(sharedMessages.zh.statuses))
      expect(statusLabel(key, "zh")).toBe(chinese);
    expect(
      customerError(
        new Error("Unexpected provider failure with private details"),
        "zh",
      ),
    ).toBe(sharedMessages.zh.errors.generic);
    expect(customerError(sharedMessages.zh.errors.passwordMismatch, "zh")).toBe(
      sharedMessages.zh.errors.passwordMismatch,
    );
    expect(statusLabel("new_unknown_state", "zh")).toBe(
      sharedMessages.zh.common.unknownStatus,
    );
    expect(activityLabel("Purchase reward", "zh")).toBe("购物奖励");
    expect(activityLabel("Merchant-authored adjustment reason", "zh")).toBe(
      "Merchant-authored adjustment reason",
    );
  });
  it("formats money, state names and calendar dates without changing submitted codes", () => {
    expect(formatMoney(1234, "USD", 2, "zh")).toBe(
      new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(12.34),
    );
    expect(formatMoney(1234, "USD", 3, "en")).toBe("$1.234");
    expect(formatLocalDate("2026-10-09", "zh")).toBe("2026年10月9日");
    expect(formatLocalDate("2026-02-31", "zh")).toBe("");
    expect(stateOptions("zh").find(([code]) => code === "CA")).toEqual([
      "CA",
      "加利福尼亚州",
    ]);
    expect(localeFromPath("/zh/account", "en")).toBe("zh");
    expect(localeFromPath("/recover/exchange", "zh")).toBe("zh");
    expect(localeFromPath("/api", "untrusted")).toBe("en");
  });
  it("customer screens do not introduce literal English JSX copy or accessibility labels", () => {
    const files: string[] = [];
    function walk(dir: string) {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) walk(file);
        else if (file.endsWith(".tsx")) files.push(file);
      }
    }
    walk("apps/storefront/app");
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8"),
        tree = ts.createSourceFile(
          file,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
      function visit(node: ts.Node) {
        if (
          ts.isFunctionDeclaration(node) &&
          node.name?.text === "VariantFields"
        )
          return;
        if (ts.isJsxText(node) && /[A-Za-z]{3}/.test(node.getText(tree)))
          violations.push(`${file}: ${node.getText(tree).trim()}`);
        if (
          ts.isJsxAttribute(node) &&
          ["aria-label", "placeholder", "title", "label"].includes(
            node.name.getText(tree),
          ) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer) &&
          /[A-Za-z]{3}/.test(node.initializer.text)
        )
          violations.push(`${file}: ${node.getText(tree)}`);
        if (
          ts.isJsxExpression(node) &&
          !(
            ts.isJsxAttribute(node.parent) &&
            ["key", "value"].includes(node.parent.name.getText(tree))
          ) &&
          node.expression &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "date"
        )
          violations.push(
            `${file}: untranslated date label ${node.getText(tree)}`,
          );
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
    expect(violations).toEqual([]);
  });
});
