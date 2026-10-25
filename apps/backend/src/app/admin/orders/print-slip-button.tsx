"use client";
import { Button } from "@supastore/ui/button";
export function PrintSlipButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      Print Slip
    </Button>
  );
}
