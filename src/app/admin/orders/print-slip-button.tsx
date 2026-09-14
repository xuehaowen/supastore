"use client";
import { Button } from "@/components/ui/button";
export function PrintSlipButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      Print Slip
    </Button>
  );
}
