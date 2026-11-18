// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { urlFor } from "./app.ts";
import { CASES } from "./cases.ts";
import {
  compareIds,
  compareCells,
  compareRows,
  diffBaseline,
  judgePage,
  nextBaseline,
  pagesToCheck,
  parseBaseline,
  sameValue,
  type Result,
} from "./grade.ts";
import {
  expectedIds,
  expectedIdsScaled,
  parseCsv,
  type CsvRow,
} from "./oracle.ts";
import { readPage } from "./page.ts";

const readTable = (html: string, idHeader: RegExp) =>
  readPage(html, idHeader).table;

const csv = parseCsv(
  readFileSync(
    new URL("../../data/synthetic_coffee_health_10000.csv", import.meta.url),
    "utf8",
  ),
);
const byId = new Map(csv.map((row) => [Number(row.ID), row]));

describe("oracle", () => {
  it("reads all 10,000 rows with IDs 1 to 10,000", () => {
    expect(csv).toHaveLength(10_000);
    expect(expectedIds(csv, {})).toEqual(
      Array.from({ length: 10_000 }, (_, i) => i + 1),
    );
  });

  it("rejects a CSV whose columns moved", () => {
    expect(() => parseCsv("Age,ID\n1,2\n")).toThrow(/header/);
  });

  it("matches any value within a filter and every filter across columns", () => {
    const ids = expectedIds(csv, {
      choices: { country: ["France", "Germany"], gender: ["Female"] },
    });
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const row = byId.get(id)!;
      expect(["France", "Germany"]).toContain(row.Country);
      expect(row.Gender).toBe("Female");
    }
    const either = expectedIds(csv, {
      choices: { country: ["France", "Germany"] },
    });
    const france = expectedIds(csv, { choices: { country: ["France"] } });
    const germany = expectedIds(csv, { choices: { country: ["Germany"] } });
    expect(either).toHaveLength(france.length + germany.length);
  });

  it("copies IDs for the scale case in ascending order", () => {
    const ids = expectedIdsScaled(csv, { choices: { gender: ["Other"] } }, 3);
    expect(ids).toHaveLength(226 * 3);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids[226]).toBe(ids[0]! + 10_000);
  });
});

// The cases only test what they say if the data cooperates.
describe("cases", () => {
  const page = (id: string) => {
    const found = CASES.find((c) => c.id === id);
    if (found?.kind !== "page") throw new Error(`no page case ${id}`);
    return expectedIds(csv, found.filter).map((rowId) => byId.get(rowId)!);
  };
  const values = (rows: CsvRow[], column: keyof CsvRow) =>
    new Set(rows.map((row) => Number(row[column])));

  it("have unique IDs", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("put rows exactly on both bounds of the inclusive ranges", () => {
    const ages = values(page("page/age-inclusive"), "Age");
    expect(ages.has(30) && ages.has(32)).toBe(true);
    const coffee = values(page("page/coffee-decimal-bounds"), "Coffee_Intake");
    expect(coffee.has(2.5) && coffee.has(3)).toBe(true);
  });

  it("have a no-match case that matches nothing and others that match something", () => {
    expect(page("page/no-match")).toHaveLength(0);
    for (const c of CASES) {
      if (c.kind === "page" && c.id !== "page/no-match") {
        expect(page(c.id).length, c.id).toBeGreaterThan(0);
      }
    }
  });

  it("include a filter with more than three pages, so the last-page check runs", () => {
    expect(page("page/gender").length).toBeGreaterThan(150);
  });
});

describe("readPage", () => {
  const header =
    "<thead><tr><th><button>ID<!-- --> <svg></svg></button></th><th>Country</th></tr></thead>";

  it("reads IDs from React's server HTML", () => {
    const html = `<table>${header}<tbody>
      <tr><td>1<!-- --></td><td>South&nbsp;Korea</td></tr>
      <tr><td>1,234</td><td>Brazil</td></tr>
    </tbody></table>`;
    expect(readTable(html, /^ID$/)).toEqual({
      headers: ["ID", "Country"],
      ids: [1, 1234],
      cells: [
        ["1", "South Korea"],
        ["1,234", "Brazil"],
      ],
    });
  });

  it("reads rows React streamed in after the table shell", () => {
    // The shape `next start` sends: the rows arrive later in a hidden table,
    // and React's inline $RS script moves them to the placeholder.
    const html = `<table>${header}<tbody><template id="P:5"></template></tbody></table>
      <table hidden><tbody id="S:5"><tr><td>4</td><td>Germany</td></tr><tr><td>9</td><td>UK</td></tr></tbody></table>
      <script>$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("S:5","P:5")</script>`;
    expect(readTable(html, /^ID$/)?.ids).toEqual([4, 9]);
  });

  it("skips hidden rows inside a visible table", () => {
    const html = `<table>${header}<tbody><tr><td>3</td><td>UK</td></tr><tr hidden><td>4</td><td>UK</td></tr></tbody></table>`;
    expect(readTable(html, /^ID$/)?.ids).toEqual([3]);
  });

  it("ignores hidden tables and prefers the table with rows over a placeholder", () => {
    const placeholder = `<table>${header}<tbody><tr><td><span class="skeleton"></span></td><td></td></tr></tbody></table>`;
    const hidden = `<table hidden>${header}<tbody><tr><td>1</td><td>UK</td></tr><tr><td>2</td><td>UK</td></tr></tbody></table>`;
    const real = `<table>${header}<tbody><tr><td>7</td><td>UK</td></tr></tbody></table>`;
    expect(readTable(placeholder + hidden + real, /^ID$/)?.ids).toEqual([7]);
  });

  it("returns null when no table has an ID column", () => {
    expect(
      readTable("<table><tr><th>Name</th></tr></table>", /^ID$/),
    ).toBeNull();
    expect(readTable("<main>Welcome</main>", /^ID$/)).toBeNull();
  });
});

describe("compareCells", () => {
  const headers = {
    Gender: /^Gender/,
    Country: /^Country/,
    Occupation: /^Occupation/,
  };
  const row1 = byId.get(1)!;
  const table = (cells: string[]) => ({
    headers: ["ID", "Gender", "Country, sorted lowest first", "Occupation"],
    ids: [1],
    cells: [cells],
  });

  it("passes rows that show their CSV values in their own columns", () => {
    expect(
      compareCells(
        table(["1", row1.Gender, row1.Country, row1.Occupation]),
        byId,
        headers,
      ),
    ).toBeNull();
  });

  it("fails a wrong, missing, or swapped value and names it", () => {
    expect(
      compareCells(
        table(["1", row1.Gender, "Atlantis", row1.Occupation]),
        byId,
        headers,
      ),
    ).toBe(`ID 1 Country: CSV "${row1.Country}", page "Atlantis"`);
    expect(compareCells(table(["1"]), byId, headers)).toMatch(
      /Gender: CSV .*, page ""/,
    );
    // Country and Occupation swapped: each value is on the row, in the wrong column.
    expect(
      compareCells(
        table(["1", row1.Gender, row1.Occupation, row1.Country]),
        byId,
        headers,
      ),
    ).toMatch(/Country/);
  });

  it("fails when a column has no header", () => {
    expect(compareCells(table(["1"]), byId, { Age: /^Age/ })).toMatch(
      /no column header/,
    );
  });
});

describe("judgePage", () => {
  const noRows = /No one matches/;
  const table = (ids: number[]) => ({
    headers: ["ID"],
    ids,
    cells: ids.map((id) => [String(id)]),
  });

  it("passes the expected rows and explains anything else", () => {
    expect(
      judgePage({ table: table([1, 2]), text: "" }, [1, 2], noRows),
    ).toBeNull();
    expect(
      judgePage({ table: table([1, 3]), text: "" }, [1, 2], noRows),
    ).toMatch(/missing IDs 2/);
    expect(judgePage({ table: null, text: "Oops" }, [1], noRows)).toMatch(
      /no table/,
    );
  });

  it("passes an empty result only when the page says so", () => {
    expect(
      judgePage(
        { table: null, text: "No one matches these filters" },
        [],
        noRows,
      ),
    ).toBeNull();
    expect(
      judgePage({ table: table([]), text: "No one matches" }, [], noRows),
    ).toBeNull();
    // An error page or a loading state that never finished is not "no rows".
    expect(
      judgePage({ table: null, text: "Something went wrong" }, [], noRows),
    ).toMatch(/no message/);
    expect(
      judgePage({ table: table([]), text: "Loading" }, [], noRows),
    ).toMatch(/no message/);
    expect(
      judgePage({ table: table([5]), text: "No one matches" }, [], noRows),
    ).toMatch(/unexpected IDs 5/);
  });

  it("accepts an empty table past the end only when told to", () => {
    const empty = { table: table([]), text: "Rows 10,001 to 10,000" };
    expect(judgePage(empty, [], noRows, "enough")).toBeNull();
    expect(judgePage(empty, [], noRows)).toMatch(/no message/);
    expect(
      judgePage(
        { table: null, text: "Something went wrong" },
        [],
        noRows,
        "enough",
      ),
    ).toMatch(/no message/);
  });

  it("reads only visible text", () => {
    const html = `<main>Results</main><div hidden>No one matches</div>
      <script>self.data = {"emptyTitle":"No one matches"}</script>`;
    expect(readPage(html, /^ID$/).text).toBe("Results");
  });
});

describe("urlFor", () => {
  it("encodes values and leaves out page 1 and unset bounds", () => {
    expect(
      urlFor({
        choices: { country: ["South Korea", "UK"], gender: [] },
        ranges: { bmi: { min: 35 } },
      }),
    ).toBe("/?country=South%20Korea,UK&bmi=35..");
    expect(urlFor({}, 3)).toBe("/?page=3");
  });
});

describe("pages", () => {
  it("walks small results in full and samples large ones", () => {
    expect(pagesToCheck(0, 50)).toEqual([1]);
    expect(pagesToCheck(28, 50)).toEqual([1, 2]);
    expect(pagesToCheck(150, 50)).toEqual([1, 2, 3, 4]);
    expect(pagesToCheck(226, 50)).toEqual([1, 2, 5, 6]);
    // The page after the last must be empty, which proves an exact multiple.
    expect(pagesToCheck(10_000, 50)).toEqual([1, 2, 200, 201]);
  });

  it("explains a wrong page", () => {
    expect(compareIds([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(compareIds([1, 2, 9], [1, 2, 3])).toBe(
      "showed 3 rows, expected 3; unexpected IDs 9; missing IDs 3",
    );
    expect(compareIds([2, 1], [1, 2])).toMatch(/different order/);
    expect(compareIds([], [1])).toMatch(/showed 0 rows, expected 1/);
  });
});

describe("round trip", () => {
  const lower = (header: string) => header.toLowerCase();
  const stored = (row: CsvRow) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.toLowerCase(),
        key === "Smoking" || key === "Alcohol_Consumption"
          ? value === "1"
          : /^\d/.test(value)
            ? Number(value)
            : value,
      ]),
    );

  it("treats 3.0 as 3 and 0/1 as false/true", () => {
    expect(sameValue("3.0", 3)).toBe(true);
    expect(sameValue("1", true)).toBe(true);
    expect(sameValue("0", true)).toBe(false);
    expect(sameValue("Good", "Good")).toBe(true);
    expect(sameValue("Good", "good")).toBe(false);
    expect(sameValue("1", null)).toBe(false);
  });

  it("passes a faithful copy and names the first wrong value", () => {
    const rows = csv.slice(0, 20);
    expect(compareRows(rows, rows.map(stored), lower)).toEqual([]);
    const changed = rows.map(stored);
    changed[4] = { ...changed[4], bmi: 99 };
    expect(compareRows(rows, changed, lower)).toEqual([
      `ID 5 BMI: CSV ${rows[4]!.BMI}, stored 99`,
    ]);
    expect(compareRows(rows, changed.slice(1), lower)[0]).toBe(
      "ID 1 is missing",
    );
  });
});

describe("baseline", () => {
  const result = (id: string, status: Result["status"]): Result => ({
    id,
    status,
    detail: "",
    ms: 0,
  });
  const ids = ["a", "b", "c", "d"];

  it("flags regressions, new passes, and cases it does not know", () => {
    const diff = diffBaseline(
      { a: "pass", b: "fail", c: "pass", gone: "pass" },
      [
        result("a", "fail"),
        result("b", "pass"),
        result("c", "skip"),
        result("d", "pass"),
      ],
      ids,
    );
    expect(diff).toEqual({
      regressed: ["a"],
      improved: ["b"],
      unlisted: ["d"],
      unknown: ["gone"],
    });
  });

  it("keeps skipped entries and drops removed cases when rewritten", () => {
    expect(
      nextBaseline(
        { a: "fail", c: "pass", gone: "pass" },
        [result("a", "fail"), result("b", "pass"), result("c", "skip")],
        ids,
      ),
    ).toEqual({ a: "fail", b: "pass", c: "pass", d: "fail" });
  });

  it("rejects a baseline that would silently stop enforcing a case", () => {
    expect(parseBaseline('{"a":"pass","b":"fail"}')).toEqual({
      a: "pass",
      b: "fail",
    });
    expect(parseBaseline('{"a":"passed"}')).toMatch(/"passed" for a/);
    expect(parseBaseline("[]")).toMatch(/object/);
    expect(parseBaseline("<<<<<<< HEAD")).toMatch(/not valid JSON/);
  });

  it("never turns a pass into a fail unless asked", () => {
    const before = { a: "pass", b: "fail" } as const;
    const results = [result("a", "fail"), result("b", "pass")];
    expect(nextBaseline(before, results, ["a", "b"])).toEqual({
      a: "pass",
      b: "pass",
    });
    expect(nextBaseline(before, results, ["a", "b"], true)).toEqual({
      a: "fail",
      b: "pass",
    });
  });
});
