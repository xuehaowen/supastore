# Notification template management

Store owners manage copy at **Settings → Notifications** (`/admin/settings/notifications`). The initial registry contains 23 events, 54 email combinations and 14 SMS combinations, covering English/Chinese and the customer/staff audiences actually used by each event.

## Editing workflow

1. Filter by event and open the desired channel, audience, and language.
2. Edit the subject and message body. Insert an allowed variable using its button.
3. Check the sample-data text and sandboxed email-layout previews.
4. Save the draft. This does not change live notification content.
5. Publish the saved draft. Unsupported variables, missing required links/reference, invalid subjects, excessive length, and missing SMS STOP instructions block publication.
6. Use published version history to restore an earlier version. History is immutable, and stale browser tabs cannot overwrite another owner's changes.

Only simple `{{namespace.field}}` variables are supported. HTML in edited text is escaped; scripts, conditions, loops, and arbitrary payload access are unavailable. Application formatting supplies currency amounts, pickup details, trusted action links, and support information. The shared HTML layout links approved URL variables and retains a plain-text alternative. Previews always use synthetic sample data and send nothing.

## Completeness and delivery

The list shows missing event/channel/audience/language combinations. Required email gaps block launch readiness. SMS coverage is shown separately; the manager does not enable live SMS, alter consent, or replace the provider's phone-verification profiles.

New email/SMS deliveries resolve a published database version before provider I/O. The outbox pins both the version ID and prepared content; later edits/publishing cannot alter a retry. Older already-prepared messages retain their existing content during the upgrade.

Missing or invalid templates put outbox notifications into review without calling a provider. Owners see the review count on this screen. After repair, **Retry unsent template reviews** only requeues notifications with zero send attempts and no prepared content. It never retries uncertain or previously submitted messages. Authentication/reset messages also use published templates; their existing privacy-preserving responses and delivery-error logging remain in place.

Template creation, draft changes, publication, rollback, and review requeue are audited. Published content cannot be changed or deleted through application operations or ordinary database UPDATE/DELETE.

## Adding an event

Declare its audience/channel requirements and allowed/required variables in `src/application/notifications/templates.ts`; add bilingual default copy to `default-templates.json` and seed it in a forward migration. An automated source/event coverage test rejects new literal notification events without registered/default templates. There is no generic notification fallback. Business workflows emit event data, not customer-facing copy.

## Rollout and validation

Apply migration **0036_notification_templates** before starting the updated application. It creates the draft/version tables, seeds all 68 published defaults, classifies existing delivery audiences, adds order notification locale, and adds the delivery template-version reference. It does not resend existing notifications. No application or production database was migrated during development.

Validation used synthetic databases, injected providers, and a local-only SMTP sink. Production-browser journeys verify editing/preview/save/publish/rollback, missing-template repair, registration verification, password reset, and store-email verification. Database tests verify authorization, stale edits, immutable history, missing-template holds, readiness, and pinned retries. Live SMS and delivery to real recipients remain disabled/unexercised.
