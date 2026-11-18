import { JSDOM, VirtualConsole } from "jsdom";

/**
 * Reads the data table out of a server-rendered page.
 *
 * React streams slow parts of a page as hidden fragments and moves them into
 * place with small inline scripts. So the page is loaded into jsdom with
 * those inline scripts running, which gives the DOM a browser shows before
 * the app's JavaScript bundle loads. External scripts are not fetched.
 */

export type PageTable = {
  headers: string[];
  /** The ID of each body row, top to bottom. */
  ids: number[];
};

const clean = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

/**
 * Finds the visible table whose header has a cell matching `idHeader` and
 * returns its IDs. If several qualify (say, a loading placeholder and the
 * real one), the one with the most ID rows wins. Returns null when no visible
 * table has an ID column.
 */
export function readTable(html: string, idHeader: RegExp): PageTable | null {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    // Swallow errors from the page's own scripts. Only the DOM matters here.
    virtualConsole: new VirtualConsole(),
  });
  // React 19 queues finished sections in $RB and reveals them on the next
  // animation frame with $RV. Reveal them now instead of waiting. If React
  // renames these, sections stay hidden and the cases fail, so this cannot
  // pass a page by mistake.
  const react = dom.window as unknown as { $RB?: unknown[]; $RV?: (queue: unknown[]) => void };
  if (Array.isArray(react.$RB) && react.$RB.length > 0 && typeof react.$RV === "function") {
    react.$RV(react.$RB);
  }
  try {
    let best: PageTable | null = null;
    for (const table of dom.window.document.querySelectorAll("table")) {
      if (table.closest("[hidden]")) continue;
      const headerRow = table.tHead?.rows[0] ?? table.rows[0];
      if (!headerRow) continue;
      const headers = [...headerRow.cells].map((cell) => clean(cell.textContent));
      const idColumn = headers.findIndex((header) => idHeader.test(header));
      if (idColumn === -1) continue;

      const ids: number[] = [];
      for (const body of table.tBodies) {
        for (const row of body.rows) {
          const cell = clean(row.cells[idColumn]?.textContent ?? "");
          // IDs may be printed with thousands separators ("1,234").
          if (/^#?\d[\d,. ]*$/.test(cell)) ids.push(Number(cell.replace(/\D/g, "")));
        }
      }
      if (best === null || ids.length > best.ids.length) best = { headers, ids };
    }
    return best;
  } finally {
    dom.window.close();
  }
}
