import { describe, expect, it } from "vitest";
import { yScale } from "./chartKit";

describe("yScale", () => {
  it("rounds the top up and gives round ticks from zero", () => {
    expect(yScale([100, 22000, null])).toEqual({ domain: [0, 25000], ticks: [0, 5000, 10000, 15000, 20000, 25000] });
  });

  it("scales small values", () => {
    expect(yScale([5400]).domain[1]).toBeGreaterThanOrEqual(5400);
    expect(yScale([180]).domain).toEqual([0, 200]);
  });

  it("handles empty or non-positive data", () => {
    expect(yScale([]).domain[1]).toBeGreaterThan(0);
    expect(yScale([null]).ticks[0]).toBe(0);
  });
});
