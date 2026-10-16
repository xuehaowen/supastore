"use client";

import { useState } from "react";
import { Button } from "@supastore/ui/button";

export function EvidenceImage({ id, label }: { id: string; label: string }) {
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  return (
    <div className="evidence-viewer">
      <div className="evidence-viewer-toolbar">
        <Button
          type="button"
          variant="outline"
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
          disabled={zoom === 1}
          aria-label="Zoom out evidence"
        >
          −
        </Button>
        <span aria-live="polite">{zoom * 100}%</span>
        <Button
          type="button"
          variant="outline"
          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
          disabled={zoom === 3}
          aria-label="Zoom in evidence"
        >
          +
        </Button>
        <Button type="button" variant="ghost" onClick={() => setZoom(1)}>
          Fit image
        </Button>
        <a href={`/api/evidence/${id}`} target="_blank" rel="noreferrer">
          Open original ↗
        </a>
      </div>
      {failed && (
        <p role="alert">
          Evidence could not be loaded. Try opening the original or reload this
          page.
        </p>
      )}
      <div
        className="evidence-image-viewport"
        tabIndex={0}
        role="region"
        aria-label={`Payment evidence image for ${label}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private evidence cannot use the image optimizer */}
        <img
          src={`/api/evidence/${id}`}
          alt={`Full-size payment evidence submitted for order ${label}`}
          onError={() => setFailed(true)}
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
        />
      </div>
    </div>
  );
}
