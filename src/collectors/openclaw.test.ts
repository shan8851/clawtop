import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonMetricFromCommand } from "./openclaw.js";

const payloadSchema = z.object({
  value: z.number()
});

describe("jsonMetricFromCommand", () => {
  it("parses valid json output", () => {
    const metric = jsonMetricFromCommand({
      args: ["status", "--json"],
      code: 0,
      command: "openclaw",
      ok: true,
      stderr: "",
      stdout: JSON.stringify({ value: 7 })
    }, payloadSchema, "status");

    expect(metric.known).toBe(true);
    expect(metric.value?.value).toBe(7);
  });

  it("returns unknown when command fails", () => {
    const metric = jsonMetricFromCommand({
      args: ["status", "--json"],
      code: 127,
      command: "openclaw",
      ok: false,
      reason: "openclaw not found",
      stderr: "",
      stdout: ""
    }, payloadSchema, "status");

    expect(metric.known).toBe(false);
    expect(metric.reason).toContain("not found");
  });

  it("returns unknown on schema mismatch", () => {
    const metric = jsonMetricFromCommand({
      args: ["status", "--json"],
      code: 0,
      command: "openclaw",
      ok: true,
      stderr: "",
      stdout: JSON.stringify({ value: "wrong" })
    }, payloadSchema, "status");

    expect(metric.known).toBe(false);
    expect(metric.reason).toContain("schema mismatch");
  });
});
