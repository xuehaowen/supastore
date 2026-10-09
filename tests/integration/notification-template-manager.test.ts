import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { staffMemberships } from "@/infrastructure/db/schema";
import { listTemplates, saveTemplateDraft, publishTemplate, rollbackTemplate, prepareNotification } from "@/application/notifications/template-manager";
import { requiredTemplates, templateKey } from "@/application/notifications/templates";
const enabled = !!process.env.DATABASE_URL?.includes("supastore");
const ownerId = `template-owner-${randomUUID()}`;
const key = { event: "order.confirmed", channel: "email", audience: "customer", locale: "en" } as const;
describe.skipIf(!enabled)("published notification templates", () => {
  beforeAll(async () => { await db.insert(staffMemberships).values({ userId: ownerId, email: `${ownerId}@example.test`, role: "owner", isActive: true }); });
  it("seeds every required template and immutable initial version through migrations", async () => {
    const rows = await listTemplates(ownerId);
    expect(new Set(rows.map((row) => templateKey(row)))).toEqual(new Set(requiredTemplates().map(templateKey)));
    expect(rows.every((row) => row.publishedVersion === 1)).toBe(true);
  });
  it("drafts do not change sends, publishing creates a version, and rollback preserves history", async () => {
    const row = (await listTemplates(ownerId)).find((row) => templateKey(row) === templateKey(key))!;
    const before = await prepareNotification(db, { ...key, deliveryId: randomUUID(), recipient: "buyer@example.test", payload: { referenceCode: "TEMPLATE-TEST" } });
    await saveTemplateDraft(ownerId, { id: row.id, revision: row.draftRevision, subject: "Published test · {{order.reference}}", body: "{{store.name}}\n{{order.reference}}\n{{order.url}}" });
    const pending = await prepareNotification(db, { ...key, deliveryId: randomUUID(), recipient: "buyer@example.test", payload: { referenceCode: "TEMPLATE-TEST" } });
    expect(pending.versionId).toBe(before.versionId);
    const draft = (await listTemplates(ownerId)).find((row) => row.id === row.id && templateKey(row) === templateKey(key))!;
    await publishTemplate(ownerId, row.id, draft.draftRevision);
    const published = await prepareNotification(db, { ...key, deliveryId: randomUUID(), recipient: "buyer@example.test", payload: { referenceCode: "TEMPLATE-TEST" } });
    expect("subject" in published.message && published.message.subject).toBe("Published test · TEMPLATE-TEST");
    expect(published.versionId).not.toBe(before.versionId);
    await rollbackTemplate(ownerId, row.id, 1, draft.draftRevision);
    const restored = await prepareNotification(db, { ...key, deliveryId: randomUUID(), recipient: "buyer@example.test", payload: { referenceCode: "TEMPLATE-TEST" } });
    expect(restored.versionId).toBe(before.versionId);
  });
  it("rejects unauthorized editors and stale draft revisions", async () => {
    const row = (await listTemplates(ownerId))[0]!;
    await expect(saveTemplateDraft("not-owner", { id: row.id, revision: row.draftRevision, subject: row.draftSubject, body: row.draftBody })).rejects.toThrow();
    await expect(saveTemplateDraft(ownerId, { id: row.id, revision: row.draftRevision - 1, subject: row.draftSubject, body: row.draftBody })).rejects.toThrow(/changed/i);
  });
  it("blocks publication of unsupported variables and retains the published version", async () => {
    const row = (await listTemplates(ownerId)).find((row) => row.event === "auth.reset_password" && row.locale === "en")!;
    await saveTemplateDraft(ownerId, { id: row.id, revision: row.draftRevision, subject: "Reset", body: "{{secret}}" });
    await expect(publishTemplate(ownerId, row.id, row.draftRevision + 1)).rejects.toThrow();
    expect((await listTemplates(ownerId)).find((item) => item.id === row.id)!.publishedVersion).toBe(1);
    await saveTemplateDraft(ownerId, { id: row.id, revision: row.draftRevision + 1, subject: row.draftSubject, body: row.draftBody });
  });
  it("requires real published templates and never sends a generic fallback", async () => {
    await expect(prepareNotification(db, { event: "missing.event", channel: "email", audience: "customer", locale: "en", deliveryId: randomUUID(), recipient: "buyer@example.test", payload: {} })).rejects.toThrow();
    await db.delete(staffMemberships).where(eq(staffMemberships.userId, ownerId));
  });
});
