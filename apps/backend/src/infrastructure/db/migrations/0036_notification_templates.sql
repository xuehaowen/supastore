CREATE TABLE notification_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event text NOT NULL, channel text NOT NULL CHECK(channel IN ('email','sms')), audience text NOT NULL CHECK(audience IN ('customer','staff')), locale text NOT NULL CHECK(locale IN ('en','zh')), draft_subject text NOT NULL CHECK(length(draft_subject)<=200), draft_body text NOT NULL CHECK(length(draft_body)<=12000), draft_revision integer NOT NULL DEFAULT 1 CHECK(draft_revision>0), published_version integer CHECK(published_version>0), updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE UNIQUE INDEX uq_notification_template_key ON notification_templates(event,channel,audience,locale);
--> statement-breakpoint
CREATE TABLE notification_template_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES notification_templates(id) ON DELETE RESTRICT, version integer NOT NULL CHECK(version>0), subject text NOT NULL, body text NOT NULL, published_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE UNIQUE INDEX uq_notification_template_version ON notification_template_versions(template_id,version);
--> statement-breakpoint
ALTER TABLE notification_templates ADD CONSTRAINT fk_notification_published_version FOREIGN KEY(id,published_version) REFERENCES notification_template_versions(template_id,version);
--> statement-breakpoint
ALTER TABLE event_deliveries ADD COLUMN audience text NOT NULL DEFAULT 'customer' CHECK(audience IN ('customer','staff')), ADD COLUMN template_version_id uuid REFERENCES notification_template_versions(id) ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE event_deliveries d SET audience='staff' FROM outbox_events e WHERE d.event_id=e.id AND (e.aggregate_type='store' OR EXISTS(SELECT 1 FROM orders o WHERE o.id=e.aggregate_id AND lower(o.guest_email)<>lower(d.recipient)));
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN notification_locale text NOT NULL DEFAULT 'en' CHECK(notification_locale IN ('en','zh'));
--> statement-breakpoint
UPDATE orders SET notification_locale=coalesce((SELECT default_locale FROM store_settings LIMIT 1),'en');
--> statement-breakpoint
INSERT INTO notification_templates(event,channel,audience,locale,draft_subject,draft_body) VALUES
('order.submitted','email','customer','en','Order received · {{order.reference}}','We received your order. Payment must be verified before fulfillment.
Order total: {{order.total}}

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('order.submitted','email','customer','zh','订单已收到 · {{order.reference}}','我们已收到您的订单。付款确认后才能安排发货或取货。
订单总额：{{order.total}}

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('order.submitted','email','staff','en','Order received · {{order.reference}}','Staff alert: Order received. Review the order in the management console.

Order: {{order.reference}}
{{order.url}}

{{store.name}}'),
('order.submitted','email','staff','zh','订单已收到 · {{order.reference}}','员工通知：订单已收到。请在管理后台审核此订单。

订单编号：{{order.reference}}
{{order.url}}

{{store.name}}'),
('order.confirmed','email','customer','en','Payment confirmed · {{order.reference}}','Your payment is confirmed. We will update you when your order is ready.
Order total: {{order.total}}

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('order.confirmed','sms','customer','en','','{{store.name}}: Payment confirmed · {{order.reference}}. Reply STOP to unsubscribe.'),
('order.confirmed','email','customer','zh','付款已确认 · {{order.reference}}','您的付款已确认。订单准备好后，我们将通知您。
订单总额：{{order.total}}

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('order.confirmed','sms','customer','zh','','{{store.name}}：付款已确认 · {{order.reference}}。回复 STOP 退订。'),
('order.cancelled','email','customer','en','Order cancelled · {{order.reference}}','Your order was cancelled. Any refund is handled separately; contact support if you have questions.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('order.cancelled','sms','customer','en','','{{store.name}}: Order cancelled · {{order.reference}}. Reply STOP to unsubscribe.'),
('order.cancelled','email','customer','zh','订单已取消 · {{order.reference}}','您的订单已取消。退款将另行处理；如有疑问，请联系客服。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('order.cancelled','sms','customer','zh','','{{store.name}}：订单已取消 · {{order.reference}}。回复 STOP 退订。'),
('order.completed','email','customer','en','Order completed · {{order.reference}}','Your order has been completed. Thank you for shopping with us.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('order.completed','sms','customer','en','','{{store.name}}: Order completed · {{order.reference}}. Reply STOP to unsubscribe.'),
('order.completed','email','customer','zh','订单已完成 · {{order.reference}}','您的订单已完成。感谢您的惠顾。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('order.completed','sms','customer','zh','','{{store.name}}：订单已完成 · {{order.reference}}。回复 STOP 退订。'),
('order.change_proposed','email','customer','en','Review your order change · {{order.reference}}','The store proposed a change to your order. Review the updated terms before paying. Contact support if you do not accept the change.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('order.change_proposed','email','customer','zh','请审核订单变更 · {{order.reference}}','商店提出了订单变更。付款前请审核更新后的条款。如不接受变更，请联系客服。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('order.change_accepted','email','customer','en','Order change accepted · {{order.reference}}','Your acceptance was recorded. Review the current order total and payment instructions.
Order total: {{order.total}}

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('order.change_accepted','email','customer','zh','订单变更已接受 · {{order.reference}}','您已接受订单变更。请查看当前订单总额及付款说明。
订单总额：{{order.total}}

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('order.change_invalidated','email','customer','en','Order change withdrawn · {{order.reference}}','The earlier proposed change no longer applies. Check the latest order details before making another payment.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('order.change_invalidated','email','customer','zh','订单变更已撤回 · {{order.reference}}','之前提出的订单变更已失效。再次付款前，请查看最新订单详情。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('order.change_invalidated','email','staff','en','Order change withdrawn · {{order.reference}}','Staff alert: Order change withdrawn. Review the order in the management console.

Order: {{order.reference}}
{{order.url}}

{{store.name}}'),
('order.change_invalidated','email','staff','zh','订单变更已撤回 · {{order.reference}}','员工通知：订单变更已撤回。请在管理后台审核此订单。

订单编号：{{order.reference}}
{{order.url}}

{{store.name}}'),
('order.access_recovery','email','customer','en','Your order access link · {{order.reference}}','Use this private link to access order {{order.reference}}. It expires after 24 hours. Do not share it.

{{action.url}}

{{store.name}}
Support: {{support.email}}'),
('order.access_recovery','email','customer','zh','订单访问链接 · {{order.reference}}','请使用此私人链接访问订单 {{order.reference}}。链接将在24小时后过期，请勿分享。

{{action.url}}

{{store.name}}
客服：{{support.email}}'),
('payment.evidence_uploaded','email','customer','en','Payment evidence received · {{order.reference}}','Your payment evidence was received for review. Uploading evidence does not confirm payment.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('payment.evidence_uploaded','email','customer','zh','付款凭证已收到 · {{order.reference}}','您的付款凭证已收到，等待审核。上传凭证不代表付款已确认。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('payment.evidence_uploaded','email','staff','en','Payment evidence received · {{order.reference}}','Staff alert: Payment evidence received. Review the order in the management console.

Order: {{order.reference}}
{{order.url}}

{{store.name}}'),
('payment.evidence_uploaded','email','staff','zh','付款凭证已收到 · {{order.reference}}','员工通知：付款凭证已收到。请在管理后台审核此订单。

订单编号：{{order.reference}}
{{order.url}}

{{store.name}}'),
('fulfillment.updated','email','customer','en','Tracking updated · {{order.reference}}','The store updated your fulfillment details. Check the latest status below.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('fulfillment.updated','email','customer','zh','物流信息已更新 · {{order.reference}}','商店已更新您的配送信息。请查看最新状态。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('fulfillment.shipped','email','customer','en','Order dispatched · {{order.reference}}','Your order has been dispatched. Check your order for shipment details.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}
Tracking: {{fulfillment.tracking}}'),
('fulfillment.shipped','sms','customer','en','','{{store.name}}: Order dispatched · {{order.reference}}. Reply STOP to unsubscribe.'),
('fulfillment.shipped','email','customer','zh','订单已发出 · {{order.reference}}','您的订单已发出。请查看订单中的物流详情。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}
物流信息：{{fulfillment.tracking}}'),
('fulfillment.shipped','sms','customer','zh','','{{store.name}}：订单已发出 · {{order.reference}}。回复 STOP 退订。'),
('fulfillment.out_for_delivery','email','customer','en','Out for delivery · {{order.reference}}','Your order is out for delivery.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('fulfillment.out_for_delivery','sms','customer','en','','{{store.name}}: Out for delivery · {{order.reference}}. Reply STOP to unsubscribe.'),
('fulfillment.out_for_delivery','email','customer','zh','订单正在配送 · {{order.reference}}','您的订单正在配送。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('fulfillment.out_for_delivery','sms','customer','zh','','{{store.name}}：订单正在配送 · {{order.reference}}。回复 STOP 退订。'),
('fulfillment.ready_for_pickup','email','customer','en','Ready for pickup · {{order.reference}}','Your order is ready for pickup. Bring your order reference and follow the collection details below.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}
Pickup: {{fulfillment.pickup}}'),
('fulfillment.ready_for_pickup','sms','customer','en','','{{store.name}}: Ready for pickup · {{order.reference}}. Reply STOP to unsubscribe.'),
('fulfillment.ready_for_pickup','email','customer','zh','订单可以取货了 · {{order.reference}}','您的订单可以取货了。请携带订单编号，并按照以下取货信息到店。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}
取货信息：{{fulfillment.pickup}}'),
('fulfillment.ready_for_pickup','sms','customer','zh','','{{store.name}}：订单可以取货了 · {{order.reference}}。回复 STOP 退订。'),
('fulfillment.completed','email','customer','en','Fulfillment complete · {{order.reference}}','Your order handoff is complete.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('fulfillment.completed','sms','customer','en','','{{store.name}}: Fulfillment complete · {{order.reference}}. Reply STOP to unsubscribe.'),
('fulfillment.completed','email','customer','zh','交付已完成 · {{order.reference}}','您的订单交付已完成。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('fulfillment.completed','sms','customer','zh','','{{store.name}}：交付已完成 · {{order.reference}}。回复 STOP 退订。'),
('return.requested','email','customer','en','Return request received · {{order.reference}}','Your return request was received. Wait for store approval before sending goods back.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('return.requested','email','customer','zh','退货申请已收到 · {{order.reference}}','您的退货申请已收到。寄回商品前，请等待商店批准。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('return.requested','email','staff','en','Return request received · {{order.reference}}','Staff alert: Return request received. Review the order in the management console.

Order: {{order.reference}}
{{order.url}}

{{store.name}}'),
('return.requested','email','staff','zh','退货申请已收到 · {{order.reference}}','员工通知：退货申请已收到。请在管理后台审核此订单。

订单编号：{{order.reference}}
{{order.url}}

{{store.name}}'),
('return.approved','email','customer','en','Return approved · {{order.reference}}','Your return was approved. Contact the store for return instructions. Approval does not mean your refund has been settled.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('return.approved','email','customer','zh','退货已批准 · {{order.reference}}','您的退货已获批准。请联系商店获取退货指引。退货批准不代表退款已完成。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('return.rejected','email','customer','en','Return not approved · {{order.reference}}','Your return request was not approved. Contact support to discuss the decision.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('return.rejected','email','customer','zh','退货未获批准 · {{order.reference}}','您的退货申请未获批准。如需了解详情，请联系客服。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('return.cancelled','email','customer','en','Return cancelled · {{order.reference}}','Your return request was cancelled. Contact support if you need help.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('return.cancelled','email','customer','zh','退货已取消 · {{order.reference}}','您的退货申请已取消。如需帮助，请联系客服。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('return.received','email','customer','en','Returned goods received · {{order.reference}}','Your returned goods were received. Refund settlement is reviewed separately against your original payment sources.

Order: {{order.reference}}
View or recover your order: {{order.url}}

{{store.name}}
Support: {{support.email}}'),
('return.received','email','customer','zh','退回商品已收到 · {{order.reference}}','您的退回商品已收到。退款将根据原付款来源另行审核处理。

订单编号：{{order.reference}}
查看或找回订单：{{order.url}}

{{store.name}}
客服：{{support.email}}'),
('auth.reset_password','email','customer','en','Reset your password · {{store.name}}','Use the link below to set a new password. If you did not request this, you can ignore this message.

{{action.url}}

{{store.name}}
Support: {{support.email}}'),
('auth.reset_password','email','customer','zh','重置密码 · {{store.name}}','请使用以下链接设置新密码。如果您没有提出此请求，请忽略此邮件。

{{action.url}}

{{store.name}}
客服：{{support.email}}'),
('auth.email_verification','email','customer','en','Verify your email address · {{store.name}}','Verify your email address using the link below to access your account.

{{action.url}}

{{store.name}}
Support: {{support.email}}'),
('auth.email_verification','email','customer','zh','验证电子邮箱 · {{store.name}}','请使用以下链接验证电子邮箱，以访问您的账户。

{{action.url}}

{{store.name}}
客服：{{support.email}}'),
('store.email_verification','email','staff','en','Verify store email delivery · {{store.name}}','Open the link below while signed in as the store owner to verify email delivery. Provider acceptance alone does not confirm receipt.

{{action.url}}

{{store.name}}
Support: {{support.email}}'),
('store.email_verification','email','staff','zh','验证商店邮件发送 · {{store.name}}','请登录店主账户后打开以下链接，验证邮件发送。邮件服务接受发送不代表收件成功。

{{action.url}}

{{store.name}}
客服：{{support.email}}'),
('sales.threshold_reached','email','staff','en','Sales threshold reached · {{store.name}}','Net sales reached {{sales.total}}, exceeding the configured threshold of {{sales.threshold}}.
Reporting period: {{sales.period}}
Review the report: {{sales.url}}'),
('sales.threshold_reached','email','staff','zh','销售额达到提醒阈值 · {{store.name}}','净销售额已达到 {{sales.total}}，超过设定的 {{sales.threshold}} 提醒阈值。
报告期间：{{sales.period}}
查看报告：{{sales.url}}');
--> statement-breakpoint
INSERT INTO notification_template_versions(template_id,version,subject,body,published_by) SELECT id,1,draft_subject,draft_body,'migration:0036' FROM notification_templates;
--> statement-breakpoint
UPDATE notification_templates SET published_version=1;
--> statement-breakpoint
CREATE FUNCTION prevent_notification_template_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published notification template versions are immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER notification_template_version_history BEFORE UPDATE OR DELETE ON notification_template_versions FOR EACH ROW EXECUTE FUNCTION prevent_notification_template_version_mutation();
