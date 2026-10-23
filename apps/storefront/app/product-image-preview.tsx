"use client";
import { useRef, useState, type ReactNode } from "react";

/** Two server-rendered photographs; native touch scrolling keeps vertical swipes usable. */
export function ProductImagePreview({
  children,
  label,
}: {
  children: ReactNode[];
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  function show(index: number) {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    track.current?.scrollTo({
      left: index * track.current.clientWidth,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  return (
    <div
      className="product-card-preview"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") show(1);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") show(0);
      }}
    >
      <div
        ref={track}
        className="product-card-image-track"
        onScroll={(event) =>
          setActive(
            Math.round(
              event.currentTarget.scrollLeft / event.currentTarget.clientWidth,
            ),
          )
        }
      >
        {children.map((child, index) => (
          <div
            key={index}
            aria-hidden={active !== index}
            inert={active !== index}
          >
            {child}
          </div>
        ))}
      </div>
      <div
        className="product-card-image-controls"
        role="group"
        aria-label={label}
      >
        {[0, 1].map((index) => (
          <button
            key={index}
            type="button"
            aria-label={`${label} ${index + 1} / 2`}
            aria-pressed={active === index}
            onClick={() => show(index)}
          >
            <span />
          </button>
        ))}
        <span aria-live="polite" className="sr-only">
          {active + 1} / 2
        </span>
      </div>
    </div>
  );
}
