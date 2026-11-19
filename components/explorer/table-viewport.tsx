"use client";

import { cn } from "@/lib/utils";
import { useExplorer } from "./explorer-context";

export function TableViewport({ children }: { children: React.ReactNode }) {
  const { t, isPending, scroller } = useExplorer();

  return (
    <div className="relative min-h-0 flex-1 bg-card">
      {isPending && (
        <div
          role="progressbar"
          aria-label={t.loading}
          className="absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden"
        >
          <div className="h-full w-full bg-primary motion-safe:w-2/5 motion-safe:animate-loading-sweep" />
        </div>
      )}
      <div
        ref={scroller}
        role="region"
        aria-label={t.tableCaption}
        aria-busy={isPending}
        // A scrolling area has to be reachable with the keyboard.
        tabIndex={0}
        className={cn(
          // The scroll padding is the pinned ID column's width.
          "peer h-full scroll-pl-16 overflow-auto outline-none transition-opacity",
          // Wait a moment before dimming so a fast answer does not flicker.
          isPending && "opacity-55 delay-150",
        )}
      >
        {children}
      </div>
      {/* The focus ring is a layer above the table, because the sticky cells
          paint over a ring drawn on the scroller itself. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-50 hidden ring-2 ring-inset ring-ring peer-focus-visible:block"
      />
    </div>
  );
}
