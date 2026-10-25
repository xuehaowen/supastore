import type { ReactNode } from "react";
import { ExpandableTableRow } from "@supastore/ui/expandable-table-row";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";

export function ExpandableOrderRow({
  reference,
  columnCount,
  children,
  items,
}: {
  reference: string;
  columnCount: number;
  children: ReactNode;
  items: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }[];
}) {
  return (
    <ExpandableTableRow
      columnCount={columnCount}
      detailsLabel={`Items for order ${reference}`}
      expandLabel={`Show items for order ${reference}`}
      collapseLabel={`Hide items for order ${reference}`}
      details={
        items.length ? (
          <Table>
            <TableCaption>Items for order {reference}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-normal">
                    {item.name}
                  </TableCell>
                  <TableCell>{item.sku || "—"}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.unitPrice}</TableCell>
                  <TableCell className="text-right">{item.lineTotal}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="admin-empty">No items recorded for this order.</p>
        )
      }
    >
      {children}
    </ExpandableTableRow>
  );
}
