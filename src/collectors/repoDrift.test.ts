import { describe, expect, it } from "vitest";
import { aggregateRepoDrift } from "./repoDrift.js";
import { knownMetric, unknownMetric } from "../types.js";

describe("aggregateRepoDrift", () => {
  it("returns unknown metrics when no workspace data exists", () => {
    const card = aggregateRepoDrift([], "missing");

    expect(card.clean.known).toBe(false);
    expect(card.repositoryCount.known).toBe(false);
  });

  it("aggregates clean and counts when all workspaces are known", () => {
    const card = aggregateRepoDrift([
      {
        aheadCount: knownMetric(1),
        behindCount: knownMetric(0),
        clean: knownMetric(true),
        repositoryRoot: knownMetric("/repo/a"),
        workspacePath: "/workspace/a"
      },
      {
        aheadCount: knownMetric(0),
        behindCount: knownMetric(2),
        clean: knownMetric(false),
        repositoryRoot: knownMetric("/repo/b"),
        workspacePath: "/workspace/b"
      }
    ], "missing");

    expect(card.clean.known).toBe(true);
    expect(card.clean.value).toBe(false);
    expect(card.aheadCount.value).toBe(1);
    expect(card.behindCount.value).toBe(2);
    expect(card.dirtyCount.value).toBe(1);
    expect(card.repositoryCount.value).toBe(2);
  });

  it("returns unknown ahead/behind when any workspace has unknown branch state", () => {
    const card = aggregateRepoDrift([
      {
        aheadCount: unknownMetric<number>("no upstream"),
        behindCount: unknownMetric<number>("no upstream"),
        clean: knownMetric(true),
        repositoryRoot: knownMetric("/repo/a"),
        workspacePath: "/workspace/a"
      }
    ], "missing");

    expect(card.aheadCount.known).toBe(false);
    expect(card.behindCount.known).toBe(false);
    expect(card.clean.known).toBe(true);
    expect(card.clean.value).toBe(true);
  });

  it("returns unknown dirty count when any workspace clean state is unknown", () => {
    const card = aggregateRepoDrift([
      {
        aheadCount: knownMetric(0),
        behindCount: knownMetric(0),
        clean: unknownMetric<boolean>("status unavailable"),
        repositoryRoot: knownMetric("/repo/a"),
        workspacePath: "/workspace/a"
      }
    ], "missing");

    expect(card.dirtyCount.known).toBe(false);
    expect(card.clean.known).toBe(false);
  });
});
