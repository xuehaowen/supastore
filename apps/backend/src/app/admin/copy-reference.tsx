"use client";

import { useState } from "react";
import { Button } from "@supastore/ui/button";

export function CopyReference({ value }: { value: string }) {
  const [status, setStatus] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Copy ${value}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("Copied");
          } catch {
            setStatus("Unable to copy. Select and copy the reference.");
          }
        }}
      >
        Copy
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {status}
      </span>
    </span>
  );
}
