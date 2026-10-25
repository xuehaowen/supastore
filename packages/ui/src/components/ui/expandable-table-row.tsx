"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@supastore/ui/button";
import { TableCell, TableRow } from "@supastore/ui/table";

export interface ExpandableTableRowProps {
  /** Summary cells, excluding the disclosure cell supplied by this component. */
  children: ReactNode;
  details: ReactNode;
  /** Total table columns, including the disclosure and selection columns. */
  columnCount: number;
  detailsLabel: string;
  expandLabel?: string;
  collapseLabel?: string;
  defaultExpanded?: boolean;
}

/** Place inside TableBody with a matching disclosure column in TableHeader. */
export function ExpandableTableRow({
  children,
  details,
  columnCount,
  detailsLabel,
  expandLabel = "Show details",
  collapseLabel = "Hide details",
  defaultExpanded = false,
}: ExpandableTableRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();
  return (
    <>
      <TableRow>
        <TableCell>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={expanded ? collapseLabel : expandLabel}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((current) => !current)}
          >
            <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          </Button>
        </TableCell>
        {children}
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={columnCount} className="p-4 whitespace-normal">
            <section id={panelId} aria-label={detailsLabel}>
              {details}
            </section>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
