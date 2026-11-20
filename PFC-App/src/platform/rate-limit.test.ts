import { describe, expect, it } from "vitest";
import { checkLimit, clearLimit, recordFailure } from "./rate-limit";

describe("failure limiter", () => {
  it("blocks after N failures and reports the wait", () => {
    const k = "login:test@pfc.vn";
    for (let i = 0; i < 5; i++) {
      expect(checkLimit(k, 5, 1000).ok).toBe(true);
      recordFailure(k, 60_000, 1000);
    }
    const r = checkLimit(k, 5, 31_000);
    expect(r).toEqual({ ok: false, retryAfterSec: 30 });
    expect(checkLimit(k, 5, 61_000).ok).toBe(true);
  });
  it("is cleared by a success", () => {
    const k = "login:clear@pfc.vn";
    for (let i = 0; i < 5; i++) recordFailure(k, 60_000, 0);
    expect(checkLimit(k, 5, 1).ok).toBe(false);
    clearLimit(k);
    expect(checkLimit(k, 5, 1).ok).toBe(true);
  });
});
