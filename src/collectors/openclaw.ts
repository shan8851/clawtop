import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { Metric, knownMetric, unknownMetric } from "../types.js";

export interface CommandRequest {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd?: string;
  readonly timeoutMs: number;
}

export interface CommandResult {
  readonly args: readonly string[];
  readonly code: number | null;
  readonly command: string;
  readonly ok: boolean;
  readonly reason?: string;
  readonly stderr: string;
  readonly stdout: string;
}

const commandReason = (result: CommandResult): string => {
  if (result.reason !== undefined) {
    return result.reason;
  }

  const stderrSnippet = result.stderr.trim();
  const stderrText = stderrSnippet.length > 0 ? ` (${stderrSnippet})` : "";
  return `${result.command} exited with code ${result.code ?? "null"}${stderrText}`;
};

export const runCommand = async (request: CommandRequest): Promise<CommandResult> => {
  const childProcess = spawn(request.command, request.args, {
    cwd: request.cwd,
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];

  const collect = (chunk: Buffer): string => chunk.toString("utf8");

  childProcess.stdout.on("data", (chunk: Buffer) => {
    stdoutParts.push(collect(chunk));
  });

  childProcess.stderr.on("data", (chunk: Buffer) => {
    stderrParts.push(collect(chunk));
  });

  return new Promise<CommandResult>((resolve) => {
    let didTimeout = false;

    const timeoutHandle = setTimeout(() => {
      didTimeout = true;
      childProcess.kill("SIGTERM");
      setTimeout(() => {
        childProcess.kill("SIGKILL");
      }, 250).unref();
    }, request.timeoutMs);

    childProcess.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeoutHandle);

      const reason = error.code === "ENOENT"
        ? `${request.command} not found`
        : `${request.command} failed: ${error.message}`;

      resolve({
        args: request.args,
        code: null,
        command: request.command,
        ok: false,
        reason,
        stderr: stderrParts.join(""),
        stdout: stdoutParts.join("")
      });
    });

    childProcess.on("close", (code) => {
      clearTimeout(timeoutHandle);

      const stdout = stdoutParts.join("");
      const stderr = stderrParts.join("");

      if (didTimeout) {
        resolve({
          args: request.args,
          code,
          command: request.command,
          ok: false,
          reason: `${request.command} timed out after ${request.timeoutMs}ms`,
          stderr,
          stdout
        });
        return;
      }

      if (code === 0) {
        resolve({
          args: request.args,
          code,
          command: request.command,
          ok: true,
          stderr,
          stdout
        });
        return;
      }

      resolve({
        args: request.args,
        code,
        command: request.command,
        ok: false,
        reason: `${request.command} exited with code ${code ?? "null"}`,
        stderr,
        stdout
      });
    });
  });
};

export const jsonMetricFromCommand = <T>(
  result: CommandResult,
  schema: z.ZodType<T>,
  label: string
): Metric<T> => {
  if (!result.ok) {
    return unknownMetric<T>(`${label}: ${commandReason(result)}`);
  }

  const trimmedOutput = result.stdout.trim();

  if (trimmedOutput.length === 0) {
    return unknownMetric<T>(`${label}: empty output`);
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(trimmedOutput);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "invalid json";
    return unknownMetric<T>(`${label}: ${reason}`);
  }

  const parsedValue = schema.safeParse(parsedJson);

  if (!parsedValue.success) {
    return unknownMetric<T>(`${label}: schema mismatch`);
  }

  return knownMetric(parsedValue.data);
};

export const textMetricFromCommand = (result: CommandResult, label: string): Metric<string> => {
  if (!result.ok) {
    return unknownMetric<string>(`${label}: ${commandReason(result)}`);
  }

  const value = result.stdout.trim();

  if (value.length === 0) {
    return unknownMetric<string>(`${label}: empty output`);
  }

  return knownMetric(value);
};

export const runOpenClawJson = async <T>(
  args: readonly string[],
  schema: z.ZodType<T>,
  label: string,
  timeoutMs = 10_000
): Promise<Metric<T>> => {
  const result = await runCommand({
    args,
    command: "openclaw",
    timeoutMs
  });

  return jsonMetricFromCommand(result, schema, label);
};

export const runOpenClawText = async (
  args: readonly string[],
  label: string,
  timeoutMs = 8_000
): Promise<Metric<string>> => {
  const result = await runCommand({
    args,
    command: "openclaw",
    timeoutMs
  });

  return textMetricFromCommand(result, label);
};

export const openClawConfigSchema = z.object({
  agents: z.object({
    list: z.array(z.object({
      id: z.string().optional(),
      workspace: z.string().optional(),
      workspaceDir: z.string().optional()
    }).passthrough()).optional()
  }).passthrough().optional(),
  channels: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export type OpenClawConfig = z.infer<typeof openClawConfigSchema>;

const uniqueValues = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value) => value.length > 0))
];

export const resolveOpenClawConfigPaths = (): readonly string[] => {
  const homeDirectory = os.homedir();
  const xdgConfigRoot = process.env["XDG_CONFIG_HOME"] ?? path.join(homeDirectory, ".config");
  const profile = process.env["OPENCLAW_PROFILE"];

  const profilePath = profile !== undefined && profile.length > 0
    ? path.join(homeDirectory, `.openclaw-${profile}`, "openclaw.json")
    : "";

  return uniqueValues([
    process.env["OPENCLAW_CONFIG_PATH"] ?? "",
    profilePath,
    path.join(xdgConfigRoot, "openclaw", "openclaw.json"),
    path.join(homeDirectory, ".openclaw", "openclaw.json")
  ]);
};

export const resolveOpenClawStateRoots = (): readonly string[] => {
  const homeDirectory = os.homedir();
  const xdgStateRoot = process.env["XDG_STATE_HOME"] ?? path.join(homeDirectory, ".local", "state");
  const profile = process.env["OPENCLAW_PROFILE"];

  const profilePath = profile !== undefined && profile.length > 0
    ? path.join(homeDirectory, `.openclaw-${profile}`)
    : "";

  return uniqueValues([
    process.env["OPENCLAW_STATE_DIR"] ?? "",
    profilePath,
    path.join(xdgStateRoot, "openclaw"),
    path.join(homeDirectory, ".openclaw")
  ]);
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readOpenClawConfig = async (): Promise<Metric<OpenClawConfig>> => {
  const candidates = resolveOpenClawConfigPaths();

  for (const candidate of candidates) {
    const exists = await fileExists(candidate);

    if (!exists) {
      continue;
    }

    const rawConfig = await readFile(candidate, "utf8");

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(rawConfig);
    } catch {
      continue;
    }

    const parsedConfig = openClawConfigSchema.safeParse(parsedJson);

    if (parsedConfig.success) {
      return knownMetric(parsedConfig.data);
    }
  }

  return unknownMetric<OpenClawConfig>("openclaw config not found or unreadable");
};

export const readJsonFileWithSchema = async <T>(
  filePath: string,
  schema: z.ZodType<T>
): Promise<Metric<T>> => {
  const exists = await fileExists(filePath);

  if (!exists) {
    return unknownMetric<T>(`${filePath} not found`);
  }

  const rawValue = await readFile(filePath, "utf8");

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawValue);
  } catch {
    return unknownMetric<T>(`${filePath} contains invalid json`);
  }

  const parsedValue = schema.safeParse(parsedJson);

  if (!parsedValue.success) {
    return unknownMetric<T>(`${filePath} schema mismatch`);
  }

  return knownMetric(parsedValue.data);
};
