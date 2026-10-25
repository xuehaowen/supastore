import type { ComponentProps } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@supastore/ui/utils";

function Breadcrumb(props: ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" {...props} />;
}
function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
function BreadcrumbItem(props: ComponentProps<"li">) {
  return <li className="inline-flex items-center gap-2" {...props} />;
}
function BreadcrumbPage(props: ComponentProps<"span">) {
  return <span aria-current="page" className="text-foreground" {...props} />;
}
function BreadcrumbSeparator() {
  return (
    <li aria-hidden="true">
      <ChevronRight className="size-3" />
    </li>
  );
}
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
