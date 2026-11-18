// Shared by the filter bar, a Client Component, and its skeleton, which the
// server renders. A value exported from a "use client" file cannot be read on
// the server, so the class list lives here.
export const FILTER_GRID =
  "-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:p-0 lg:grid-cols-4 min-[1800px]:grid-cols-6";
