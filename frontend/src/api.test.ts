import { afterEach, describe, expect, it, vi } from "vitest";
import { getAccuracy, getForecast } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("additive API parameters", () => {
  it.each([undefined, "retrospective", "prior"] as const)("requests forecast calibration %s without changing date or cutoff", async (calibration) => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ series: [], p90_abs_error: null }) });
    vi.stubGlobal("fetch", fetch);
    const result = await getForecast("2026-01-15", 9, calibration);
    const url = new URL(fetch.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/api/forecast");
    expect(Object.fromEntries(url.searchParams)).toEqual({ day: "2026-01-15", cutoff_hour: "9", calibration: calibration ?? "retrospective" });
    expect(result.p90_abs_error).toBeNull();
  });

  it("preserves the accuracy request contract", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    await getAccuracy("2026-01-01", "2026-01-31", 0);
    expect(fetch).toHaveBeenCalledWith("/api/accuracy?from=2026-01-01&to=2026-01-31&cutoff_hour=0");
  });
});
