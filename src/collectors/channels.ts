import { z } from "zod";
import { ChannelsCard, CollectorOutput, Metric, buildWarning, knownMetric, unknownMetric } from "../types.js";
import { OpenClawConfig, readOpenClawConfig, runOpenClawJson } from "./openclaw.js";

const channelEntrySchema = z.object({
  configured: z.boolean().optional(),
  connected: z.boolean().optional(),
  running: z.boolean().optional()
}).passthrough();

const channelsStatusSchema = z.object({
  channels: z.record(z.string(), channelEntrySchema)
}).passthrough();

const configuredCountFromConfig = (configMetric: Metric<OpenClawConfig>): Metric<number> => {
  if (!configMetric.known || configMetric.value === null) {
    return unknownMetric<number>(configMetric.reason ?? "openclaw config unavailable");
  }

  const configuredCount = Object.keys(configMetric.value.channels ?? {}).length;
  return knownMetric(configuredCount);
};

export const collectChannelsCard = async (): Promise<CollectorOutput<ChannelsCard>> => {
  const [channelsMetric, configMetric] = await Promise.all([
    runOpenClawJson(["channels", "status", "--json"], channelsStatusSchema, "openclaw channels status --json"),
    readOpenClawConfig()
  ]);

  if (channelsMetric.known && channelsMetric.value !== null) {
    const channelEntries = Object.values(channelsMetric.value.channels);
    const configuredCount = channelEntries.filter((entry) => entry.configured === true).length;
    const connectedEntries = channelEntries.filter((entry) => typeof entry.connected === "boolean");

    const connectedCountMetric = connectedEntries.length > 0
      ? knownMetric(connectedEntries.filter((entry) => entry.connected === true).length)
      : unknownMetric<number>("channel providers did not expose connected state");

    return {
      card: {
        configuredCount: knownMetric(configuredCount),
        connectedCount: connectedCountMetric
      },
      warnings: connectedCountMetric.known
        ? []
        : [buildWarning(
          "channels",
          "channels_connected_unknown",
          connectedCountMetric.reason ?? "connected count unknown",
          "info"
        )]
    };
  }

  const configuredCount = configuredCountFromConfig(configMetric);
  const connectedReason = channelsMetric.reason ?? "channels status unavailable";

  return {
    card: {
      configuredCount,
      connectedCount: unknownMetric<number>(connectedReason)
    },
    warnings: [buildWarning(
      "channels",
      "channels_status_unavailable",
      connectedReason,
      "warn"
    )]
  };
};
