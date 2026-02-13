import { describe, expect, it } from "vitest";
import { compareDotVersions, deriveUpdateAvailabilityMetric } from "./versionDrift.js";
import { knownMetric, unknownMetric } from "../types.js";

describe("compareDotVersions", () => {
  it("detects when right version is newer", () => {
    expect(compareDotVersions("2026.2.9", "2026.2.12")).toBe(-1);
  });

  it("detects when versions are equal", () => {
    expect(compareDotVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("detects when left version is newer", () => {
    expect(compareDotVersions("2.0.0", "1.9.9")).toBe(1);
  });
});

describe("deriveUpdateAvailabilityMetric", () => {
  it("returns true when latest version is newer than installed", () => {
    const metric = deriveUpdateAvailabilityMetric(
      knownMetric("2026.2.9"),
      knownMetric("2026.2.12")
    );

    expect(metric.known).toBe(true);
    expect(metric.value).toBe(true);
  });

  it("returns false when installed is current", () => {
    const metric = deriveUpdateAvailabilityMetric(
      knownMetric("2026.2.12"),
      knownMetric("2026.2.12")
    );

    expect(metric.known).toBe(true);
    expect(metric.value).toBe(false);
  });

  it("returns unknown when one side is unknown", () => {
    const metric = deriveUpdateAvailabilityMetric(
      knownMetric("2026.2.12"),
      unknownMetric<string>("latest missing")
    );

    expect(metric.known).toBe(false);
    expect(metric.reason).toContain("latest");
  });
});
