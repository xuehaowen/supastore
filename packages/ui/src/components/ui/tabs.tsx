"use client";

import { Tabs as Primitive } from "@base-ui/react/tabs";
import { cn } from "@supastore/ui/utils";

const Tabs = Primitive.Root;
function TabsList({ className, ...props }: Primitive.List.Props) {
  return (
    <Primitive.List
      data-slot="tabs-list"
      className={cn("flex gap-1 rounded-lg bg-muted p-1", className)}
      {...props}
    />
  );
}
function TabsTrigger({ className, ...props }: Primitive.Tab.Props) {
  return (
    <Primitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "min-h-11 flex-1 rounded-md px-4 py-2 text-sm font-medium outline-none transition-colors data-active:bg-background data-active:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
function TabsContent({ className, ...props }: Primitive.Panel.Props) {
  return (
    <Primitive.Panel
      data-slot="tabs-content"
      className={cn(
        "pt-6 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
export { Tabs, TabsList, TabsTrigger, TabsContent };
