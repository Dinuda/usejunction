import { describe, expect, it } from "vitest";
import {
  allowsLegacyCostFingerprint,
  usageFingerprintsEquivalent,
} from "@/lib/sync/usage-fingerprint";

const rounded = "in:1,out:2,cr:3,cw:4,r:5,req:6,cost:101,sug:0,acc:0,add:0,del:0,com:0,ai:,v:0,mk:usage";
const truncated = "in:1,out:2,cr:3,cw:4,r:5,req:6,cost:100,sug:0,acc:0,add:0,del:0,com:0,ai:,v:0,mk:usage";

describe("usage fingerprint compatibility", () => {
  it("accepts only the legacy one-micro truncation", () => {
    expect(usageFingerprintsEquivalent(rounded, truncated, true)).toBe(true);
    expect(usageFingerprintsEquivalent(rounded, truncated, false)).toBe(false);
    expect(usageFingerprintsEquivalent(rounded, truncated.replace("in:1", "in:2"), true)).toBe(false);
    expect(usageFingerprintsEquivalent(rounded, truncated.replace("cost:100", "cost:99"), true)).toBe(false);
  });

  it("limits compatibility to agents older than 0.4.9", () => {
    expect(allowsLegacyCostFingerprint("0.4.8")).toBe(true);
    expect(allowsLegacyCostFingerprint("v0.4.8")).toBe(true);
    expect(allowsLegacyCostFingerprint("0.4.9")).toBe(false);
    expect(allowsLegacyCostFingerprint("0.5.0")).toBe(false);
    expect(allowsLegacyCostFingerprint("unknown")).toBe(false);
    expect(allowsLegacyCostFingerprint(null)).toBe(false);
  });
});
