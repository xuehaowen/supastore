"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customerAuthRequest } from "./customer-auth-requests";
import { saveProfileAction } from "./customer-actions";

export function CustomerAuthTools({
  locale,
  name,
  phone = "",
  token,
  invalidToken = false,
  reset = false,
}: {
  locale: string;
  name?: string;
  phone?: string;
  token?: string;
  invalidToken?: boolean;
  reset?: boolean;
}) {
  const zh = locale === "zh";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    operation: "profile" | "change" | "forgot" | "verify" | "reset",
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");
      if (
        (operation === "change" || operation === "reset") &&
        password !== data.get("confirmation")
      ) {
        throw new Error(
          zh ? "两次输入的密码不一致。" : "Passwords do not match.",
        );
      }
      if (operation === "profile") await saveProfileAction(data);
      if (operation === "change")
        await customerAuthRequest("change-password", {
          currentPassword: data.get("currentPassword"),
          newPassword: password,
          revokeOtherSessions: true,
        });
      if (operation === "forgot")
        await customerAuthRequest("request-password-reset", {
          email,
          redirectTo: `${window.location.origin}/${locale}/account/reset-password`,
        });
      if (operation === "verify")
        await customerAuthRequest("send-verification-email", {
          email,
          callbackURL: `${window.location.origin}/${locale}/account`,
        });
      if (operation === "reset") {
        if (!token || invalidToken)
          throw new Error(
            zh
              ? "链接已失效，请重新申请。"
              : "This link is invalid. Request a new one.",
          );
        await customerAuthRequest("reset-password", {
          token,
          newPassword: password,
        });
        setDone(true);
      }
      setMessage(
        operation === "forgot" || operation === "verify"
          ? zh
            ? "如果邮箱符合条件，我们会发送邮件。请检查收件箱。"
            : "If this email is eligible, we will send a link. Check your inbox."
          : zh
            ? "已保存。"
            : "Saved.",
      );
      if (operation === "profile") window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : zh
            ? "无法完成请求。请检查信息，或重新申请链接。"
            : "Unable to complete this request. Check your details or request a new link.",
      );
    } finally {
      setBusy(false);
    }
  }
  const passwords = (
    <>
      <label>
        {zh ? "新密码" : "New password"}
        <Input
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
      </label>
      <label>
        {zh ? "确认密码" : "Confirm password"}
        <Input
          name="confirmation"
          type="password"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
      </label>
    </>
  );
  return (
    <div className="grid gap-5">
      {message && <p role="status">{message}</p>}
      {reset ? (
        <>
          {(!token || invalidToken) && (
            <p role="alert">
              {zh
                ? "重置链接已失效。"
                : "This reset link is invalid or expired."}
            </p>
          )}
          {token && !invalidToken && !done && (
            <form className="grid gap-3" onSubmit={(e) => submit(e, "reset")}>
              {passwords}
              <Button type="submit" disabled={busy}>
                {zh ? "重置密码" : "Reset password"}
              </Button>
            </form>
          )}
          <Link href={`/${locale}/account`}>
            {zh ? "返回登录" : "Return to sign in"}
          </Link>
        </>
      ) : name !== undefined ? (
        <>
          <form className="grid gap-3" onSubmit={(e) => submit(e, "profile")}>
            <label>
              {zh ? "姓名" : "Name"}
              <Input
                name="name"
                required
                maxLength={100}
                defaultValue={name}
                autoComplete="name"
              />
            </label>
            <label>
              {zh ? "电话（可选）" : "Phone (optional)"}
              <Input
                name="phone"
                type="tel"
                maxLength={32}
                defaultValue={phone}
                autoComplete="tel"
              />
            </label>
            <Button type="submit" disabled={busy}>
              {zh ? "保存个人资料" : "Save profile"}
            </Button>
          </form>
          <details>
            <summary>{zh ? "修改密码" : "Change password"}</summary>
            <form
              className="grid gap-3 mt-3"
              onSubmit={(e) => submit(e, "change")}
            >
              <label>
                {zh ? "当前密码" : "Current password"}
                <Input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
              {passwords}
              <Button type="submit" disabled={busy}>
                {zh ? "修改密码" : "Change password"}
              </Button>
            </form>
          </details>
        </>
      ) : (
        <>
          {(["forgot", "verify"] as const).map((operation) => (
            <details key={operation}>
              <summary>
                {operation === "forgot"
                  ? zh
                    ? "忘记密码？"
                    : "Forgot password?"
                  : zh
                    ? "重新发送验证邮件"
                    : "Resend verification email"}
              </summary>
              <form
                className="grid gap-3 mt-3"
                onSubmit={(e) => submit(e, operation)}
              >
                <label>
                  {operation === "forgot" ? (zh ? "重置密码邮箱" : "Email for password reset") : (zh ? "验证邮箱" : "Email for verification")}
                  <Input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
                <Button type="submit" disabled={busy}>{zh ? "发送链接" : "Send link"}</Button>
              </form>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

