import { existsSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { expect, it } from "vitest";
import { fixtureDirectory } from "../../scripts/fixture-directory.mjs";
it("creates distinct owned fixture directories and removes only its own directory", () => {
  const first = fixtureDirectory("browser"),
    second = fixtureDirectory("browser");
  try {
    expect(first.path).not.toBe(second.path);
    first.cleanup();
    expect(existsSync(first.path)).toBe(false);
    expect(existsSync(second.path)).toBe(true);
  } finally {
    first.cleanup();
    second.cleanup();
  }
});
it("rejects arbitrary directory names", () => {
  expect(() => fixtureDirectory("../outside")).toThrow("Invalid fixture kind");
});
it("rejects replacing an owned directory with a junction before cleanup", () => {
  const first = fixtureDirectory("browser"),
    second = fixtureDirectory("browser");
  first.cleanup();
  symlinkSync(second.path, first.path, "junction");
  try {
    expect(() => first.cleanup()).toThrow("changed before cleanup");
    expect(existsSync(second.path)).toBe(true);
  } finally {
    if (process.platform === "win32") rmdirSync(first.path);
    else unlinkSync(first.path);
    second.cleanup();
  }
});
