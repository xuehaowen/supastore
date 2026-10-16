import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { staffIdentity } from "@/infrastructure/web";
import { getTemplate } from "@/application/notifications/template-manager";
import { notificationEvents } from "@/application/notifications/templates";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/application/common/errors";
import { AdminNav } from "@/app/admin/admin-nav";
import { Notice } from "@/app/components";
import { TemplateEditor } from "../template-editor";

export default async function NotificationTemplateEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params,
    query = await searchParams;
  const model = await staffIdentity()
    .then((userId) => getTemplate(userId, id))
    .catch((error) => {
      if (error instanceof NotFoundError) notFound();
      if (error instanceof UnauthorizedError) redirect("/admin/login");
      if (error instanceof ForbiddenError) redirect("/admin");
      throw error;
    });
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <Link href="/admin/settings/notifications">
          All notification templates
        </Link>
        <h1>
          {notificationEvents[model.template.event]?.label ||
            model.template.event}
        </h1>
        <p>
          {model.template.channel} · {model.template.audience} ·{" "}
          {model.template.locale === "zh" ? "中文" : "English"}
        </p>
        <Notice error={query.error} />
        {query.saved && (
          <p role="status">
            {query.saved === "draft"
              ? "Draft saved."
              : query.saved === "published"
                ? "Template published."
                : "Published version restored."}
          </p>
        )}
        <TemplateEditor
          key={`${id}:${model.template.draftRevision}`}
          template={model.template}
          versions={model.versions.map((version) => ({
            version: version.version,
            createdAt: version.createdAt.toISOString(),
            subject: version.subject,
            body: version.body,
          }))}
        />
      </main>
    </>
  );
}
