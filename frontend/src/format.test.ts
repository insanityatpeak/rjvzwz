import { describe, expect, it } from "vitest";
import { errorHistogram, fmtMW, toCsv } from "./format";
import type { SeriesPoint } from "./types";

const pt = (error: number | null): SeriesPoint => ({
  startTime: "2026-01-10T12:00:00Z",
  publishTime: "2026-01-09T08:30:00Z",
  forecast: 100,
  actual: error == null ? null : 100 - error,
  error,
  lead_hours: 27.5,
});

describe("format", () => {
  it("formats MW and missing values", () => {
    expect(fmtMW(12345.6)).toBe("12,346 MW");
    expect(fmtMW(null)).toBe("–");
  });

  it("bins errors and fills empty bins", () => {
    const h = errorHistogram([pt(100), pt(1500), pt(-500), pt(null)]);
    expect(h.map((b) => [b.bin, b.count])).toEqual([
      [-1000, 1],
      [0, 1],
      [1000, 1],
    ]);
  });

  it("exports csv with header", () => {
    const csv = toCsv([pt(10)]);
    expect(csv.split("\n")).toHaveLength(2);
    expect(csv.split("\n")[1]).toBe("2026-01-10T12:00:00Z,2026-01-09T08:30:00Z,27.5,100,90,10");
  });
});
