import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  verify: vi.fn(),
  sign: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/infrastructure/web", () => ({ staffIdentity: mocks.identity }));
vi.mock("@/infrastructure/auth/session", () => ({
  verifyStaffInTransaction: mocks.verify,
}));
vi.mock("@/infrastructure/storage", () => ({ presignDownload: mocks.sign }));
vi.mock("@/infrastructure/db", () => ({
  db: {
    transaction: async (work: any) =>
      work({ select: () => ({ from: () => ({ where: mocks.read }) }) }),
  },
}));
import { GET } from "@/app/api/evidence/[id]/route";
const request = () =>
  GET(
    new Request(
      "http://localhost/api/evidence/00000000-0000-4000-8000-000000000001",
    ),
    { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.identity.mockResolvedValue("staff");
  mocks.verify.mockResolvedValue({ userId: "staff", role: "staff" });
  mocks.read.mockResolvedValue([
    { status: "finalized", finalKey: "private/immutable.png" },
  ]);
  mocks.sign.mockResolvedValue("https://storage.test/short-lived-grant");
});
it("only grants finalized immutable evidence to current staff", async () => {
  const response = await request();
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(
    "https://storage.test/short-lived-grant",
  );
  expect(mocks.verify).toHaveBeenCalledWith(expect.anything(), "staff");
  expect(mocks.sign).toHaveBeenCalledWith("private/immutable.png");
});
it.each(["intent", "candidate", "expired"])(
  "does not grant %s uploads",
  async (status) => {
    mocks.read.mockResolvedValue([{ status, finalKey: "private/key" }]);
    expect((await request()).status).toBe(404);
    expect(mocks.sign).not.toHaveBeenCalled();
  },
);
it("does not grant missing evidence", async () => {
  mocks.read.mockResolvedValue([]);
  expect((await request()).status).toBe(404);
  expect(mocks.sign).not.toHaveBeenCalled();
});
it.each(["anonymous", "revoked"])(
  "rejects %s access before reading evidence",
  async (kind) => {
    (kind === "anonymous" ? mocks.identity : mocks.verify).mockRejectedValue(
      new Error("Private details"),
    );
    const response = await request();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  },
);
