import { pgTable, uuid, text, integer, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  event: text("event").notNull(),
  channel: text("channel", { enum: ["email", "sms"] }).notNull(),
  audience: text("audience", { enum: ["customer", "staff"] }).notNull(),
  locale: text("locale", { enum: ["en", "zh"] }).notNull(),
  draftSubject: text("draft_subject").notNull(),
  draftBody: text("draft_body").notNull(),
  draftRevision: integer("draft_revision").notNull().default(1),
  publishedVersion: integer("published_version"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("uq_notification_template_key").on(t.event, t.channel, t.audience, t.locale), check("notification_template_channel", sql`${t.channel} IN ('email','sms')`), check("notification_template_audience", sql`${t.audience} IN ('customer','staff')`), check("notification_template_locale", sql`${t.locale} IN ('en','zh')`), check("notification_template_revision", sql`${t.draftRevision} > 0 AND (${t.publishedVersion} IS NULL OR ${t.publishedVersion} > 0)`)]);

export const notificationTemplateVersions = pgTable("notification_template_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull().references(() => notificationTemplates.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  publishedBy: text("published_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("uq_notification_template_version").on(t.templateId, t.version), check("notification_template_version_positive", sql`${t.version} > 0`)]);
