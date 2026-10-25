"use client";
import { useState } from "react";
import { Button } from "@supastore/ui/button";
import { textFor } from "@supastore/i18n/messages";
import { signOutStaff } from "../client-requests";

export function StaffSignOut() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const m = textFor("en").staffSession;
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await signOutStaff();
            window.location.assign("/admin/login");
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
      >
        {busy ? m.signingOut : m.signOut}
      </Button>
      {failed && <p role="alert">{m.signOutFailed}</p>}
    </div>
  );
}
