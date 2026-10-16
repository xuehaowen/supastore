import type { TemplateKey } from "./templates";

export function emailLayout(input: {
  key: TemplateKey;
  subject: string;
  body: string;
  storeName: string;
  render: (value: string) => string;
  escape: (value: string) => string;
}) {
  const { key, subject, storeName, render, escape } = input;
  const chinese = key.locale === "zh";
  const body = input.body.replace(/\r\n/g, "\n");
  const primary = ["action.url", "order.url", "sales.url"].find((variable) =>
    new RegExp(`\\{\\{\\s*${variable.replace(".", "\\.")}\\s*\\}\\}`).test(
      body,
    ),
  );
  const label =
    key.event === "auth.reset_password"
      ? chinese
        ? "重设密码"
        : "Reset password"
      : primary === "action.url"
        ? key.event === "order.access_recovery"
          ? chinese
            ? "访问订单"
            : "Access your order"
          : chinese
            ? "验证邮箱"
            : "Verify email"
        : primary === "sales.url"
          ? chinese
            ? "查看报告"
            : "View report"
          : key.audience === "staff"
            ? chinese
              ? "处理订单"
              : "Review order"
            : chinese
              ? "查看订单"
              : "View order";
  // Recognize only template tokens; substituted customer values cannot change structure.
  const footer =
    /^\s*(?:\{\{\s*store\.name\s*\}\}|(?:Support:|客服：)\s*\{\{\s*support\.email\s*\}\})\s*$/;
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .filter((line) => !footer.test(line))
        .join("\n"),
    )
    .filter((paragraph) => paragraph.trim());
  const content = paragraphs
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      const details = lines.map((line) =>
        /^([^:{}\n]+)[:：]\s*(\{\{\s*(?:order\.(?:reference|total|received|balance)|fulfillment\.(?:pickup|tracking)|sales\.(?:total|threshold|period))\s*\}\})\s*$/.exec(
          line,
        ),
      );
      if (details.every((detail) => detail !== null)) {
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#fafaf9;border:1px solid #e7e5e4;border-radius:6px">${details.map((detail) => `<tr><td style="padding:10px 12px;color:#57534e;vertical-align:top;width:35%">${escape(detail[1])}</td><td style="padding:10px 12px;overflow-wrap:anywhere">${render(detail[2]).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>`;
      }
      return `<p style="margin:0 0 20px;line-height:1.65;overflow-wrap:anywhere">${render(paragraph).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  // The same validated link renderer is used for both inline links and the button.
  const action = primary
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td bgcolor="#1c1917" style="border-radius:6px;padding:14px 24px" data-email-action="primary">${render(
        `{{${primary}}}`,
      )
        .replace(
          /style="[^"]*"/,
          'style="color:#ffffff;text-decoration:none;font-weight:bold;display:inline-block"',
        )
        .replace(/>([^<]*)<\/a>$/, `>${label}</a>`)}</td></tr></table>`
    : "";
  const hasSupport = /\{\{\s*support\.email\s*\}\}/.test(body);
  const support = hasSupport
    ? `<p style="margin:8px 0 0">${chinese ? "需要帮助？客服：" : "Need help? Contact:"} ${render("{{support.email}}")}</p>`
    : "";
  return `<!doctype html><html lang="${key.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f5f5f4;font-family:Arial,sans-serif;color:#1c1917"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(subject)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:8px"><tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5e4;font-weight:bold;font-size:16px">${escape(storeName)}</td></tr><tr><td style="padding:28px;font-size:16px"><h1 style="margin:0 0 24px;font-size:24px;line-height:1.3">${escape(subject)}</h1>${content}${action}</td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e7e5e4;font-size:13px;line-height:1.6;color:#57534e">${escape(storeName)}${support}</td></tr></table></td></tr></table></body></html>`;
}
