import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { staffIdentity } from "@/infrastructure/web";
import { getAttributeAdmin } from "@/application/use-cases/catalog/manage-attributes";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Badge } from "@supastore/ui/badge";
import {
  saveAttributeAction,
  saveAttributeTranslationAction,
} from "@/app/admin/catalog-actions";

export default async function AttributePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; page?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(q.page || "1", 10) || 1),
  );
  const data = await getAttributeAdmin(staff, id, page);
  if (!data) notFound();
  const { attribute: a, values, translations, valueTranslations } = data;
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <Link href="/admin/attributes">← All attributes</Link>
        <h1>{a.name}</h1>
        <p>
          {a.kind === "variant"
            ? "Variant option: values define purchasable variants."
            : "Descriptive attribute: values describe product facts and do not generate variants."}
        </p>
        <Notice error={q.error} />
        {q.saved && (
          <Alert>
            <AlertDescription>Attribute saved.</AlertDescription>
          </Alert>
        )}
        <section className="panel">
          <h2>Attribute details</h2>
          <form action={saveAttributeAction}>
            <Hidden name="id" value={id} />
            <Hidden name="code" value={a.code} />
            <p>Permanent code: {a.code}</p>
            <Field name="label" label="Attribute name" value={a.name} />
            <label className="check">
              <Checkbox name="archived" defaultChecked={a.isArchived} />
              Archived
            </label>
            <Button type="submit">Save attribute</Button>
          </form>
        </section>
        <section className="panel">
          <h2>Values</h2>
          <AdminDialog trigger="Add value" title={`Add value · ${a.name}`}>
            <form action={saveAttributeAction}>
              <Hidden name="attributeId" value={id} />
              <Field name="label" label="Value label" />
              <Field name="code" label="Permanent value code" />
              <Button type="submit">Create value</Button>
            </form>
          </AdminDialog>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Value</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {values.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.label}</TableCell>
                  <TableCell>{v.code}</TableCell>
                  <TableCell>
                    <Badge variant={v.isArchived ? "secondary" : "default"}>
                      {v.isArchived ? "Archived" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <AdminDialog
                      trigger="Edit value"
                      title={`Edit value · ${v.label}`}
                    >
                      <form action={saveAttributeAction}>
                        <Hidden name="id" value={v.id} />
                        <Hidden name="attributeId" value={id} />
                        <Hidden name="code" value={v.code} />
                        <Field
                          name="label"
                          label="Value label"
                          value={v.label}
                        />
                        <label className="check">
                          <Checkbox
                            name="archived"
                            defaultChecked={v.isArchived}
                          />
                          Archived
                        </label>
                        <Button type="submit">Save value</Button>
                      </form>
                    </AdminDialog>
                    {(["en", "zh"] as const).map((locale) => (
                      <AdminDialog
                        key={locale}
                        trigger={`Translate ${locale}`}
                        title={`${v.label} translation · ${locale}`}
                      >
                        <form action={saveAttributeTranslationAction}>
                          <Hidden name="attributeId" value={id} />
                          <Hidden name="valueId" value={v.id} />
                          <Hidden name="locale" value={locale} />
                          <Field
                            name="label"
                            label="Translated label"
                            value={
                              valueTranslations.find(
                                (t) =>
                                  t.attributeValueId === v.id &&
                                  t.locale === locale,
                              )?.label || ""
                            }
                          />
                          <Button type="submit">Save translation</Button>
                        </form>
                      </AdminDialog>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
              {!values.length && (
                <TableRow>
                  <TableCell colSpan={4}>
                    Add values for this{" "}
                    {a.kind === "variant"
                      ? "variant option"
                      : "descriptive attribute"}
                    .
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <nav className="pager" aria-label="Value pages">
            {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
            <span>Page {page}</span>
            {data.hasNext && <Link href={`?page=${page + 1}`}>Next</Link>}
          </nav>
        </section>
        <section className="panel">
          <h2>Attribute translations</h2>
          {(["en", "zh"] as const).map((locale) => (
            <AdminDialog
              key={locale}
              trigger={`Edit ${locale} translation`}
              title={`Attribute translation · ${locale}`}
            >
              <form action={saveAttributeTranslationAction}>
                <Hidden name="attributeId" value={id} />
                <Hidden name="locale" value={locale} />
                <Field
                  name="label"
                  label="Translated name"
                  value={
                    translations.find((t) => t.locale === locale)?.name || ""
                  }
                />
                <Button type="submit">Save translation</Button>
              </form>
            </AdminDialog>
          ))}
        </section>
      </main>
    </>
  );
}
