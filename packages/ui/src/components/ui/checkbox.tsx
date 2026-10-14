import * as React from "react";
import { cn } from "@supastore/ui/utils";

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="checkbox"
      className={cn(
        "mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      type="checkbox"
      {...props}
    />
  );
}

export { Checkbox };
