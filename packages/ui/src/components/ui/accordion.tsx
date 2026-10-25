"use client";

import { Accordion as Primitive } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@supastore/ui/utils";

const Accordion = Primitive.Root;
function AccordionItem({ className, ...props }: Primitive.Item.Props) {
  return (
    <Primitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}
function AccordionTrigger({
  className,
  children,
  ...props
}: Primitive.Trigger.Props) {
  return (
    <Primitive.Header>
      <Primitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex min-h-12 w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-180" />
      </Primitive.Trigger>
    </Primitive.Header>
  );
}
function AccordionContent({ className, ...props }: Primitive.Panel.Props) {
  return (
    <Primitive.Panel
      data-slot="accordion-content"
      className={cn("pb-5 text-sm leading-7 text-muted-foreground", className)}
      {...props}
    />
  );
}
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
