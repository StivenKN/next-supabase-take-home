import { JSDOM, VirtualConsole } from "jsdom";

/**
 * Reads a server-rendered page the way a person sees it.
 *
 * React streams slow parts of a page as hidden fragments and moves them into
 * place with small inline scripts. So the page is loaded into jsdom with
 * those inline scripts running, which gives the DOM a browser shows before
 * the app's JavaScript bundle loads. External scripts are not fetched.
 */

export type PageTable = {
  headers: string[];
  ids: number[];
  /** The text of each cell in those rows, in the same order as `ids`. */
  cells: string[][];
  /**
   * ID cells of full rows that hold text but not a number. A placeholder row
   * has an empty ID cell, and a message row spans the columns.
   */
  unreadable: string[];
};

export type Page = {
  table: PageTable | null;
  /** The text a person can see: no scripts, styles, or hidden elements. */
  text: string;
};

const clean = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

/**
 * If several visible tables have an ID column (say, a loading placeholder
 * and the real one), the one with the most ID rows wins.
 */
export function readPage(html: string, idHeader: RegExp): Page {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    // Swallow errors from the page's own scripts. Only the DOM matters here.
    virtualConsole: new VirtualConsole(),
  });
  // React 19 queues finished sections in $RB and reveals them on the next
  // animation frame with $RV. Reveal them now instead of waiting. If React
  // renames these, the sections stay hidden: no table and no text, so every
  // case fails.
  const react = dom.window as unknown as {
    $RB?: unknown[];
    $RV?: (queue: unknown[]) => void;
  };
  if (
    Array.isArray(react.$RB) &&
    react.$RB.length > 0 &&
    typeof react.$RV === "function"
  ) {
    react.$RV(react.$RB);
  }
  try {
    const document = dom.window.document;
    let table: PageTable | null = null;
    for (const element of document.querySelectorAll("table")) {
      if (element.closest("[hidden]")) continue;
      const headerRow = element.tHead?.rows[0] ?? element.rows[0];
      if (!headerRow) continue;
      const headers = [...headerRow.cells].map((cell) =>
        clean(cell.textContent),
      );
      const idColumn = headers.findIndex((header) => idHeader.test(header));
      if (idColumn === -1) continue;

      const ids: number[] = [];
      const cells: string[][] = [];
      const unreadable: string[] = [];
      for (const body of element.tBodies) {
        for (const row of body.rows) {
          if (row.closest("[hidden]")) continue;
          const texts = [...row.cells].map((cell) => clean(cell.textContent));
          const id = texts[idColumn] ?? "";
          // IDs may be printed with thousands separators ("1,234").
          if (/^#?\d[\d,. ]*$/.test(id)) {
            ids.push(Number(id.replace(/\D/g, "")));
            cells.push(texts);
          } else if (id !== "" && texts.length === headers.length) {
            unreadable.push(id);
          }
        }
      }
      if (table === null || ids.length > table.ids.length) {
        table = { headers, ids, cells, unreadable };
      }
    }

    const body = document.body.cloneNode(true) as HTMLElement;
    for (const element of body.querySelectorAll(
      "script, style, template, noscript, [hidden]",
    )) {
      element.remove();
    }
    return { table, text: clean(body.textContent) };
  } finally {
    dom.window.close();
  }
}
