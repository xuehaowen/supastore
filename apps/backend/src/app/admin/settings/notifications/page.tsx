import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { NativeSelect } from "@supastore/ui/native-select";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { eventDeliveries } from "@/infrastructure/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { staffIdentity } from "@/infrastructure/web";
import { listTemplates } from "@/application/notifications/template-manager";
import {
  notificationEvents,
  requiredTemplates,
  templateKey,
  templateCoverage,
} from "@/application/notifications/templates";
import { ForbiddenError, UnauthorizedError } from "@/application/common/errors";
import { AdminNav } from "@/app/admin/admin-nav";
import { Notice, Hidden } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { createDraftAction, retryReviewsAction } from "./actions";

export default async function NotificationSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; event?: string }>;
}) {
  const rows = await staffIdentity()
    .then(listTemplates)
    .catch((error) => {
      if (error instanceof UnauthorizedError) redirect("/admin/login");
      if (error instanceof ForbiddenError) redirect("/admin");
      throw error;
    });
  const query = await searchParams;
  const visibleTemplates = requiredTemplates().filter(
    (key) => !query.event || key.event === query.event,
  );
  const missing = templateCoverage(
    rows.filter((row) => row.publishedVersion !== null),
  );
  const [review] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventDeliveries)
    .where(
      and(
        eq(eventDeliveries.status, "review"),
        eq(eventDeliveries.providerStatus, "template_preparation_failed"),
      ),
    );
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>Notification templates</h1>
        <p>
          Edit email and SMS copy by event, audience, and language. Published
          versions are immutable; saved drafts do not affect sending.
        </p>
        <Notice error={query.error} />
        {query.saved && (
          <p role="status">
            {query.saved === "requeued"
              ? "Unsent template reviews requeued."
              : "Template draft created."}
          </p>
        )}
        {missing.length ? (
          <section role="alert" className="panel">
            <h2>Missing published templates</h2>
            <p>
              {missing.filter((key) => key.channel === "email").length} email
              combinations and{" "}
              {missing.filter((key) => key.channel === "sms").length} SMS
              combinations need attention. Email gaps block launch readiness;
              SMS templates are required for their supported events when SMS is
              used.
            </p>
            <ul>
              {missing.map((key) => (
                <li key={templateKey(key)}>
                  {notificationEvents[key.event]!.label} · {key.channel} ·{" "}
                  {key.audience} · {key.locale}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p role="status">All required templates are published.</p>
        )}
        {!!review?.count && (
          <section role="alert" className="panel">
            <h2>Notifications held for template review</h2>
            <p>
              {review.count} notifications could not be prepared. Repair the
              missing or invalid templates, then retry only notifications that
              have never been sent.
            </p>
            <form action={retryReviewsAction}>
              <Button type="submit">Retry unsent template reviews</Button>
            </form>
          </section>
        )}
        <form method="get" className="panel">
          <label htmlFor="template-event">Filter by event</label>
          <NativeSelect
            id="template-event"
            name="event"
            defaultValue={query.event || ""}
          >
            <option value="">All events</option>
            {Object.entries(notificationEvents).map(([event, definition]) => (
              <option key={event} value={event}>
                {definition.label}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit">Filter templates</Button>
        </form>
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTemplates.map((key) => {
                const row = rows.find(
                  (row) => templateKey(row) === templateKey(key),
                );
                return (
                  <TableRow key={templateKey(key)}>
                    <TableCell>
                      {notificationEvents[key.event]!.label}
                      <small className="block">{key.event}</small>
                    </TableCell>
                    <TableCell>{key.channel}</TableCell>
                    <TableCell>{key.audience}</TableCell>
                    <TableCell>
                      {key.locale === "zh" ? "中文" : "English"}
                    </TableCell>
                    <TableCell>
                      {row?.publishedVersion
                        ? `Version ${row.publishedVersion}`
                        : "Missing"}
                    </TableCell>
                    <TableCell>
                      {row ? (
                        <Link href={`/admin/settings/notifications/${row.id}`}>
                          Edit template
                        </Link>
                      ) : (
                        <form action={createDraftAction}>
                          {Object.entries(key).map(([name, value]) => (
                            <Hidden key={name} name={name} value={value} />
                          ))}
                          <Button type="submit">Create draft</Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!visibleTemplates.length && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No templates match this event.{" "}
                    <Link href="/admin/settings/notifications">
                      Clear the event filter
                    </Link>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        <p>
          Phone verification codes use the verification provider&apos;s
          profiles. This manager does not enable live SMS or change customer
          consent.
        </p>
      </main>
    </>
  );
}
