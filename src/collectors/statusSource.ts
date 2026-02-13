import { z } from "zod";
import { Metric } from "../types.js";
import { runOpenClawJson } from "./openclaw.js";

export const statusSourceSchema = z.object({
  agents: z.object({
    agents: z.array(z.object({
      id: z.string().optional(),
      workspaceDir: z.string().optional()
    }).passthrough()).optional(),
    defaultId: z.string().optional()
  }).passthrough().optional(),
  gateway: z.object({
    error: z.string().nullable().optional(),
    reachable: z.boolean().nullable().optional()
  }).passthrough().optional(),
  securityAudit: z.object({
    summary: z.object({
      critical: z.number(),
      info: z.number(),
      warn: z.number()
    }).optional()
  }).optional(),
  sessions: z.object({
    count: z.number().optional()
  }).optional(),
  update: z.object({
    registry: z.object({
      latestVersion: z.string().optional()
    }).optional()
  }).optional()
}).passthrough();

export type StatusSource = z.infer<typeof statusSourceSchema>;

export const collectStatusSource = async (): Promise<Metric<StatusSource>> => (
  runOpenClawJson(["status", "--json"], statusSourceSchema, "openclaw status --json")
);
