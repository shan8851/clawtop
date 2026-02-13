import { z } from "zod";
import { CollectorOutput, SessionsCard, buildWarning, knownMetric, unknownMetric } from "../types.js";
import { runOpenClawJson } from "./openclaw.js";

const sessionsSchema = z.object({
  count: z.number().optional(),
  sessions: z.array(z.unknown()).optional()
}).passthrough();

export const defaultActiveSessionWindowMinutes = 60;

const activeCountFromPayload = (payload: z.infer<typeof sessionsSchema>): number => (
  payload.count ?? payload.sessions?.length ?? 0
);

export const collectSessionsCard = async (
  activeWindowMinutes = defaultActiveSessionWindowMinutes
): Promise<CollectorOutput<SessionsCard>> => {
  const sessionsMetric = await runOpenClawJson(
    ["sessions", "--json", "--active", String(activeWindowMinutes)],
    sessionsSchema,
    `openclaw sessions --json --active ${activeWindowMinutes}`
  );

  if (sessionsMetric.known && sessionsMetric.value !== null) {
    return {
      card: {
        activeCount: knownMetric(activeCountFromPayload(sessionsMetric.value)),
        activeWindowMinutes
      },
      warnings: []
    };
  }

  const reason = sessionsMetric.reason ?? "active sessions unavailable";

  return {
    card: {
      activeCount: unknownMetric<number>(reason),
      activeWindowMinutes
    },
    warnings: [buildWarning("sessions", "sessions_active_unknown", reason, "warn")]
  };
};
