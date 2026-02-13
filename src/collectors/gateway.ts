import { CollectorOutput, GatewayCard, Metric, buildWarning, knownMetric, unknownMetric } from "../types.js";
import { StatusSource } from "./statusSource.js";

const gatewayFromStatus = (statusSource: StatusSource): GatewayCard => {
  const reachable = statusSource.gateway?.reachable;
  const error = statusSource.gateway?.error;

  if (typeof reachable === "boolean") {
    return {
      error: error !== undefined && error !== null ? knownMetric(error) : unknownMetric<string>("gateway error not provided"),
      reachable: knownMetric(reachable)
    };
  }

  return {
    error: error !== undefined && error !== null ? knownMetric(error) : unknownMetric<string>("gateway state unavailable"),
    reachable: unknownMetric<boolean>("gateway reachability unavailable")
  };
};

const fallbackGatewayCard = (reason: string): GatewayCard => ({
  error: unknownMetric<string>(reason),
  reachable: unknownMetric<boolean>(reason)
});

const warningsForReachability = (reachable: Metric<boolean>) => {
  if (!reachable.known) {
    return [buildWarning(
      "gateway",
      "gateway_reachability_unknown",
      reachable.reason ?? "gateway reachability unknown",
      "warn"
    )];
  }

  if (reachable.value === false) {
    return [buildWarning("gateway", "gateway_unreachable", "gateway unreachable", "error")];
  }

  return [];
};

export const collectGatewayCard = (
  statusSourceMetric: Metric<StatusSource>
): CollectorOutput<GatewayCard> => {
  if (!statusSourceMetric.known || statusSourceMetric.value === null) {
    const reason = statusSourceMetric.reason ?? "status source unavailable";
    const card = fallbackGatewayCard(reason);
    return {
      card,
      warnings: warningsForReachability(card.reachable)
    };
  }

  const card = gatewayFromStatus(statusSourceMetric.value);

  return {
    card,
    warnings: warningsForReachability(card.reachable)
  };
};
