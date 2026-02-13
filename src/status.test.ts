import { describe, expect, it } from "vitest";
import { deriveOverallCard } from "./status.js";
import { BoardSnapshot, knownMetric, unknownMetric } from "./types.js";

const healthySnapshot = (): Omit<BoardSnapshot, "overall"> => ({
  agents: {
    configuredCount: knownMetric(2)
  },
  channels: {
    configuredCount: knownMetric(2),
    connectedCount: knownMetric(2)
  },
  cron: {
    enabledCount: knownMetric(5),
    failingOrRecentErrorCount: knownMetric(0)
  },
  gateway: {
    error: unknownMetric<string>("no error"),
    reachable: knownMetric(true)
  },
  generatedAt: new Date().toISOString(),
  repoDrift: {
    aheadCount: knownMetric(0),
    behindCount: knownMetric(0),
    clean: knownMetric(true),
    dirtyCount: knownMetric(0),
    repositoryCount: knownMetric(1),
    workspaces: []
  },
  security: {
    critical: knownMetric(0),
    info: knownMetric(1),
    warning: knownMetric(0)
  },
  sessions: {
    activeCount: knownMetric(1),
    activeWindowMinutes: 60
  },
  versionDrift: {
    installedVersion: knownMetric("2026.2.9"),
    latestVersion: knownMetric("2026.2.9"),
    updateAvailable: knownMetric(false)
  },
  warnings: []
});

describe("deriveOverallCard", () => {
  it("returns RED for critical security findings", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      security: {
        ...snapshot.security,
        critical: knownMetric(1)
      }
    });

    expect(overall.level).toBe("RED");
    expect(overall.reasons.join(" ")).toContain("critical security findings");
  });

  it("returns RED for failing cron jobs", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      cron: {
        ...snapshot.cron,
        failingOrRecentErrorCount: knownMetric(3)
      }
    });

    expect(overall.level).toBe("RED");
  });

  it("returns RED for unreachable gateway", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      gateway: {
        ...snapshot.gateway,
        reachable: knownMetric(false)
      }
    });

    expect(overall.level).toBe("RED");
  });

  it("returns AMBER for warning findings", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      security: {
        ...snapshot.security,
        warning: knownMetric(2)
      }
    });

    expect(overall.level).toBe("AMBER");
  });

  it("returns AMBER for unknown critical card state", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      versionDrift: {
        ...snapshot.versionDrift,
        latestVersion: unknownMetric<string>("latest unavailable")
      }
    });

    expect(overall.level).toBe("AMBER");
    expect(overall.reasons.join(" ")).toContain("unknown state in critical cards");
  });

  it("returns AMBER for dirty repository", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      repoDrift: {
        ...snapshot.repoDrift,
        clean: knownMetric(false)
      }
    });

    expect(overall.level).toBe("AMBER");
  });

  it("returns AMBER when repository is behind", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      repoDrift: {
        ...snapshot.repoDrift,
        behindCount: knownMetric(2)
      }
    });

    expect(overall.level).toBe("AMBER");
  });

  it("returns GREEN when all checks are healthy", () => {
    const overall = deriveOverallCard(healthySnapshot());

    expect(overall.level).toBe("GREEN");
  });

  it("keeps RED precedence over AMBER conditions", () => {
    const snapshot = healthySnapshot();
    const overall = deriveOverallCard({
      ...snapshot,
      cron: {
        ...snapshot.cron,
        failingOrRecentErrorCount: knownMetric(1)
      },
      security: {
        ...snapshot.security,
        warning: knownMetric(2)
      }
    });

    expect(overall.level).toBe("RED");
  });
});
