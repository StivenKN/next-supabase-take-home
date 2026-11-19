// Shared by the filter bar, a Client Component, and its skeleton, which the
// server renders. A value exported from a "use client" file cannot be read on
// the server, so the class lists live here.
//
// "tall" is a min-height variant from tailwind.config.ts. The grid takes up to
// four rows, which a short window (a phone on its side, a docked DevTools
// panel) cannot spare, so it applies only when the window is also tall.

export const FILTER_SECTION =
  "grid gap-x-6 gap-y-2 border-b bg-background px-4 py-2.5 xl:tall:grid-cols-[12rem_minmax(0,1fr)]";

export const FILTER_COUNT =
  "flex min-w-0 flex-wrap items-baseline gap-x-3 xl:tall:flex-col xl:tall:gap-y-1 xl:tall:py-1";

// The padding in the sideways row keeps focus rings from being clipped, and
// the scroll padding keeps a filter scrolled into view off the screen's edge.
export const FILTER_GRID =
  "-mx-4 flex scroll-px-4 gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-color:hsl(var(--input))_transparent] [scrollbar-width:thin] md:tall:mx-0 md:tall:grid md:tall:grid-cols-3 md:tall:overflow-visible md:tall:p-0 lg:tall:grid-cols-4 min-[1800px]:tall:grid-cols-6";
