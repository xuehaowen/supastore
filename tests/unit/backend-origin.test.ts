import { expect, it } from "vitest";
import { resolveBackendOrigin } from "../../packages/config/backend-origin.mjs";

it("normalizes backend origins for both rewrite and proxy consumers", () => {
  expect(resolveBackendOrigin({})).toBe("http://127.0.0.1:3000");
  expect(
    resolveBackendOrigin({ BACKEND_URL: "https://BACKEND.example.test/" }),
  ).toBe("https://backend.example.test");
});

it.each([
  "ftp://backend.example.test",
  "https://user:secret@backend.example.test",
  "https://backend.example.test/path",
  "https://backend.example.test/?token=x",
  "https://backend.example.test/#fragment",
])("rejects a backend URL that is not a bare HTTP origin: %s", (value) => {
  expect(() => resolveBackendOrigin({ BACKEND_URL: value })).toThrow(
    "BACKEND_URL must be an HTTP origin",
  );
});
