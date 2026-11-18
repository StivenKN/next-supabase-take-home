import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, type ExplorerState } from "./schema";
import {
  hrefForState,
  pageWindow,
  parseSearchParams,
  serializeState,
} from "./search-params";

describe("parseSearchParams", () => {
  it("returns the default view for an empty URL", () => {
    expect(parseSearchParams({})).toEqual(DEFAULT_STATE);
  });

  it("reads every kind of filter", () => {
    const state = parseSearchParams({
      country: "Germany,Brazil",
      stress_level: "High",
      age: "30..50",
      sleep_hours: "..5.5",
      bmi: "25..",
      smoking: "yes",
      alcohol_consumption: "no",
      sort: "-caffeine_mg",
      page: "3",
    });
    expect(state.choices.country).toEqual(["Brazil", "Germany"]);
    expect(state.choices.stress_level).toEqual(["High"]);
    expect(state.ranges.age).toEqual({ min: 30, max: 50 });
    expect(state.ranges.sleep_hours).toEqual({ min: null, max: 5.5 });
    expect(state.ranges.bmi).toEqual({ min: 25, max: null });
    expect(state.flags).toEqual({ smoking: true, alcohol_consumption: false });
    expect(state.sort).toEqual({ column: "caffeine_mg", ascending: false });
    expect(state.page).toBe(3);
  });

  it("drops enum values the database does not have", () => {
    const state = parseSearchParams({ sleep_quality: "Good,Terrible,Poor" });
    // Kept in the enum's order, not the URL's.
    expect(state.choices.sleep_quality).toEqual(["Poor", "Good"]);
  });

  it("drops country values that cannot go in a PostgREST list", () => {
    const state = parseSearchParams({ country: 'Spain,Bad"Quote,Back\\slash' });
    expect(state.choices.country).toEqual(["Spain"]);
  });

  it("ignores malformed ranges, sorts, flags, and pages", () => {
    const state = parseSearchParams({
      age: "abc..50",
      bmi: "20",
      coffee_intake: "1e3..2",
      smoking: "maybe",
      sort: "physical_activity_hours; drop table",
      page: "-2",
    });
    expect(state.ranges.age).toEqual({ min: null, max: 50 });
    expect(state.ranges.bmi).toEqual({ min: null, max: null });
    expect(state.ranges.coffee_intake).toEqual({ min: null, max: 2 });
    expect(state.flags.smoking).toBeNull();
    expect(state.sort).toEqual(DEFAULT_STATE.sort);
    expect(state.page).toBe(1);
  });

  it("uses the first value when a parameter repeats", () => {
    const state = parseSearchParams({ gender: ["Male", "Female"] });
    expect(state.choices.gender).toEqual(["Male"]);
  });
});

describe("serializeState", () => {
  it("writes nothing for the default view", () => {
    expect(serializeState(DEFAULT_STATE)).toBe("");
    expect(hrefForState("/es", DEFAULT_STATE)).toBe("/es");
  });

  it("round-trips a state through the URL", () => {
    const state: ExplorerState = {
      choices: {
        ...DEFAULT_STATE.choices,
        country: ["South Korea", "UK"],
        health_issues: ["None", "Mild"],
      },
      ranges: {
        ...DEFAULT_STATE.ranges,
        age: { min: 18, max: null },
        coffee_intake: { min: 2.5, max: 4 },
      },
      flags: { smoking: false, alcohol_consumption: null },
      sort: { column: "bmi", ascending: true },
      page: 12,
    };
    const query = serializeState(state);
    expect(query).toBe(
      "country=South+Korea,UK&health_issues=None,Mild&age=18..&coffee_intake=2.5..4&smoking=no&sort=bmi&page=12",
    );
    const params = Object.fromEntries(new URLSearchParams(query));
    expect(parseSearchParams(params)).toEqual(state);
  });
});

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the first, last, and neighbouring pages", () => {
    expect(pageWindow(1, 200)).toEqual([1, 2, null, 200]);
    expect(pageWindow(100, 200)).toEqual([1, null, 99, 100, 101, null, 200]);
    expect(pageWindow(200, 200)).toEqual([1, null, 199, 200]);
  });

  it("shows a page instead of a gap that would hide only that page", () => {
    expect(pageWindow(4, 200)).toEqual([1, 2, 3, 4, 5, null, 200]);
    expect(pageWindow(197, 200)).toEqual([1, null, 196, 197, 198, 199, 200]);
  });
});
