import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCollectionAdmin } from "@/application/use-cases/catalog/manage-collections";
import { staffIdentity } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Button } from "@/components/ui/button";
import { CatalogImageUpload } from "@/app/admin/catalog-image-upload";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  saveCollectionAction,
  changeCollectionMemberAction,
  saveCollectionTranslationAction,
} from "@/app/admin/catalog-actions";
export default async function CollectionDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    error?: string;
    saved?: string;
    page?: string;
    memberQ?: string;
  }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const data = await getCollectionAdmin(
    staff,
    id,
    query.q,
    page,
    query.memberQ,
  );
  if (!data) notFound();
  const { collection, members, candidates, translations } = data;
  const identity = (
    <>
      <Hidden name="collectionId" value={id} />
      <Hidden name="revision" value={String(collection.revision)} />
    </>
  );
  return (
    <main className="admin">
      <AdminNav />
      <Link className="admin-back-link" href="/admin/collections">
        ← Collections
      </Link>
      <h1>{collection.title}</h1>
      <p className="admin-description">
        Manage collection details, products, order, and translations.
      </p>
      <Notice error={query.error} />
      <section className="panel">
        <h2>Collection image</h2>
        {collection.imageKey && (
          <img
            src={`/api/admin/catalog-image?collectionId=${id}`}
            alt={collection.imageAlt || collection.title}
            width="240"
            height="160"
            className="rounded-lg object-cover"
          />
        )}
        <CatalogImageUpload entityId={id} entityType="collection" />
      </section>
      <form method="get" className="filter-bar">
        <Field
          name="memberQ"
          label="Search collection members"
          value={query.memberQ || ""}
          required={false}
        />
        <Button type="submit">Find members</Button>
      </form>
      <nav className="pager" aria-label="Collection member pages">
        {page > 1 && (
          <Link
            href={`?${new URLSearchParams({ page: String(page - 1), memberQ: query.memberQ || "" })}`}
          >
            Previous
          </Link>
        )}
        <span>Page {page}</span>
        {data.hasNext && (
          <Link
            href={`?${new URLSearchParams({ page: String(page + 1), memberQ: query.memberQ || "" })}`}
          >
            Next
          </Link>
        )}
      </nav>
      {query.saved && (
        <p role="status" className="admin-save-notice">
          Collection saved.
        </p>
      )}
      <section className="panel">
        <form action={saveCollectionAction} className="grid gap-4">
          <Hidden name="id" value={id} />
          <Hidden name="revision" value={String(collection.revision)} />
          <Field
            name="title"
            label="Collection title"
            value={collection.title}
          />
          <Field
            name="handle"
            label="Collection handle"
            value={collection.handle}
          />
          <Field
            name="description"
            label="Description"
            value={collection.description}
            required={false}
          />
          <label>
            <input
              name="published"
              type="checkbox"
              defaultChecked={collection.isPublished}
            />{" "}
            Published
          </label>
          <Button type="submit">Save collection</Button>
        </form>
      </section>
      <section className="panel">
        <h2>Products</h2>
        <form method="get" className="admin-filter-bar">
          <Field
            name="q"
            label="Find products to add"
            value={query.q}
            required={false}
          />
          <Button type="submit">Search</Button>
        </form>
        <form action={changeCollectionMemberAction} className="grid gap-4">
          {identity}
          <label>
            Product
            <NativeSelect name="productId" required>
              <option value="">Choose product</option>
              {candidates.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.title}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Field
            name="position"
            label="Position"
            type="number"
            value={members.length}
          />
          <Button type="submit">Add product</Button>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(({ product, position }) => (
              <TableRow key={product.id}>
                <TableCell>{product.title}</TableCell>
                <TableCell>{position}</TableCell>
                <TableCell>
                  <AdminDialog
                    trigger="Edit membership"
                    title={`Collection membership · ${product.title}`}
                  >
                    <form
                      action={changeCollectionMemberAction}
                      className="grid gap-4"
                    >
                      {identity}
                      <Hidden name="productId" value={product.id} />
                      <Field
                        name="position"
                        label="Position"
                        type="number"
                        value={position}
                      />
                      <Button type="submit">Save position</Button>
                      <Button
                        type="submit"
                        name="remove"
                        value="1"
                        variant="outline"
                      >
                        Remove from collection
                      </Button>
                    </form>
                  </AdminDialog>
                </TableCell>
              </TableRow>
            ))}
            {!members.length && (
              <TableRow>
                <TableCell colSpan={3}>
                  No products in this collection.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      <section className="panel">
        <h2>Translations</h2>
        {(["en", "zh"] as const).map((locale) => {
          const existing = translations.find((item) => item.locale === locale);
          return (
            <AdminDialog
              key={locale}
              trigger={`Edit ${locale} translation`}
              title={`Collection translation · ${locale}`}
            >
              <form
                action={saveCollectionTranslationAction}
                className="grid gap-4"
              >
                <Hidden name="collectionId" value={id} />
                <Hidden name="locale" value={locale} />
                <Field
                  name="title"
                  label="Translated title"
                  value={existing?.title}
                />
                <Field
                  name="description"
                  label="Translated description"
                  value={existing?.description}
                  required={false}
                />
                <Button type="submit">Save translation</Button>
              </form>
            </AdminDialog>
          );
        })}
      </section>
    </main>
  );
}
