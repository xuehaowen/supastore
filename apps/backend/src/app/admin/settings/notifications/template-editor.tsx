"use client";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  definitionFor,
  previewValues,
  renderTemplate,
  type TemplateKey,
} from "@/application/notifications/templates";
import { Hidden } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { saveDraftAction, publishAction, rollbackAction } from "./actions";

type Template = TemplateKey & {
  id: string;
  draftSubject: string;
  draftBody: string;
  draftRevision: number;
  publishedVersion: number | null;
};
function Submit({
  children,
  disabled = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Working…" : children}
    </Button>
  );
}
export function TemplateEditor({
  template,
  versions,
}: {
  template: Template;
  versions: {
    version: number;
    createdAt: string;
    subject: string;
    body: string;
  }[];
}) {
  const [subject, setSubject] = useState(template.draftSubject),
    [body, setBody] = useState(template.draftBody);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dirty =
    subject !== template.draftSubject || body !== template.draftBody;
  let preview: ReturnType<typeof renderTemplate> | undefined,
    previewError = "";
  try {
    preview = renderTemplate(
      template,
      { subject, body },
      previewValues(),
      "preview",
      "preview@example.test",
    );
  } catch (error) {
    previewError =
      error instanceof Error ? error.message : "Preview unavailable.";
  }
  return (
    <div className="grid gap-6">
      <form action={saveDraftAction} className="panel">
        <Hidden name="id" value={template.id} />
        <Hidden name="revision" value={String(template.draftRevision)} />
        {template.channel === "email" ? (
          <div className="grid gap-2">
            <label htmlFor="notification-email-subject">Email subject</label>
            <Input
              id="notification-email-subject"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
            />
          </div>
        ) : (
          <Hidden name="subject" value="" />
        )}
        <label htmlFor="notification-message-body">Message body</label>
        <textarea
          id="notification-message-body"
          ref={textarea}
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={12}
          maxLength={template.channel === "sms" ? 500 : 12000}
        />
        <p>
          Use the variables below. HTML, scripts, loops, and conditions are not
          executed. Required links and SMS STOP instructions are checked when
          publishing.
        </p>
        <div
          className="flex flex-wrap gap-2"
          aria-label="Insert template variables"
        >
          {definitionFor(template).variables.map((variable) => (
            <Button
              key={variable}
              type="button"
              variant="outline"
              onClick={() => {
                const value = `{{${variable}}}`,
                  start = textarea.current?.selectionStart ?? body.length,
                  end = textarea.current?.selectionEnd ?? start;
                setBody(body.slice(0, start) + value + body.slice(end));
                textarea.current?.focus();
              }}
            >{`{{${variable}}}`}</Button>
          ))}
        </div>
        <Submit>Save draft</Submit>
      </form>
      <section className="panel">
        <h2>Preview with sample data</h2>
        {previewError ? (
          <p role="status">{previewError}</p>
        ) : (
          preview && (
            <>
              {"subject" in preview && <h3>{preview.subject}</h3>}
              <pre className="whitespace-pre-wrap break-words">
                {preview.text}
              </pre>
              {"html" in preview && (
                <iframe
                  title="Email layout preview"
                  srcDoc={preview.html}
                  sandbox=""
                  style={{
                    width: "100%",
                    minHeight: 420,
                    border: "1px solid #ddd",
                  }}
                />
              )}
            </>
          )
        )}
      </section>
      <form action={publishAction} className="panel">
        <Hidden name="id" value={template.id} />
        <Hidden name="revision" value={String(template.draftRevision)} />
        <p>
          Currently published:{" "}
          {template.publishedVersion
            ? `version ${template.publishedVersion}`
            : "none"}
          . Publishing applies to newly prepared messages; retries retain their
          existing content.
        </p>
        {dirty && (
          <p>Save your changes before publishing or restoring a version.</p>
        )}
        <Submit disabled={dirty}>Publish saved draft</Submit>
      </form>
      <section className="panel">
        <h2>Published version history</h2>
        {versions.map((version) => (
          <details key={version.version}>
            <summary>
              Version {version.version}
              {version.version === template.publishedVersion
                ? " · current"
                : ""}
            </summary>
            <p>{new Date(version.createdAt).toLocaleString()}</p>
            <h3>{version.subject}</h3>
            <pre className="whitespace-pre-wrap">{version.body}</pre>
            {version.version !== template.publishedVersion && (
              <form action={rollbackAction}>
                <Hidden name="id" value={template.id} />
                <Hidden
                  name="revision"
                  value={String(template.draftRevision)}
                />
                <Hidden name="version" value={String(version.version)} />
                <Submit disabled={dirty}>
                  Restore version {version.version}
                </Submit>
              </form>
            )}
          </details>
        ))}
      </section>
    </div>
  );
}
