import { z } from "zod";
import { AgentsCard, CollectorOutput, Metric, buildWarning, knownMetric, unknownMetric } from "../types.js";
import { readOpenClawConfig, runOpenClawJson } from "./openclaw.js";
import { StatusSource } from "./statusSource.js";

const agentsListSchema = z.array(z.object({
  id: z.string().optional(),
  name: z.string().optional()
}).passthrough());

const countFromStatusSource = (statusSourceMetric: Metric<StatusSource>): Metric<number> => {
  const agents = statusSourceMetric.value?.agents?.agents;

  if (agents !== undefined) {
    return knownMetric(agents.length);
  }

  return unknownMetric<number>(statusSourceMetric.reason ?? "status source unavailable for agents");
};

export const collectAgentsCard = async (
  statusSourceMetric: Metric<StatusSource>
): Promise<CollectorOutput<AgentsCard>> => {
  const [agentsListMetric, configMetric] = await Promise.all([
    runOpenClawJson(["agents", "list", "--json"], agentsListSchema, "openclaw agents list --json"),
    readOpenClawConfig()
  ]);

  if (agentsListMetric.known && agentsListMetric.value !== null) {
    return {
      card: {
        configuredCount: knownMetric(agentsListMetric.value.length)
      },
      warnings: []
    };
  }

  const statusCount = countFromStatusSource(statusSourceMetric);

  if (statusCount.known) {
    return {
      card: {
        configuredCount: statusCount
      },
      warnings: [buildWarning(
        "agents",
        "agents_list_unavailable",
        agentsListMetric.reason ?? "agents list command unavailable",
        "warn"
      )]
    };
  }

  const configAgents = configMetric.value?.agents?.list;

  if (configAgents !== undefined) {
    return {
      card: {
        configuredCount: knownMetric(configAgents.length)
      },
      warnings: [buildWarning(
        "agents",
        "agents_list_unavailable",
        agentsListMetric.reason ?? "agents list command unavailable",
        "warn"
      )]
    };
  }

  const reason = agentsListMetric.reason
    ?? statusSourceMetric.reason
    ?? configMetric.reason
    ?? "agent count unavailable";

  return {
    card: {
      configuredCount: unknownMetric<number>(reason)
    },
    warnings: [buildWarning("agents", "agents_unknown", reason, "warn")]
  };
};
