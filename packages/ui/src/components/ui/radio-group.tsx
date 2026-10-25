"use client";

import { RadioGroup as PrimitiveGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { cn } from "@supastore/ui/utils";

function RadioGroup({ className, ...props }: PrimitiveGroup.Props) {
  return (
    <PrimitiveGroup
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}
function RadioGroupItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-background outline-none data-checked:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Radio.Indicator className="size-2 rounded-full bg-primary" />
    </Radio.Root>
  );
}
export { RadioGroup, RadioGroupItem };
