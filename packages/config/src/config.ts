import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { Secret } from "./secret.js";

export const ConfigFileSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().optional(),
  maxSteps: z.number().int().positive().optional(),
});

export type ConfigFileData = z.infer<typeof ConfigFileSchema>;

export interface HarnessConfig {
  apiKey: Secret;
  baseUrl: string;
  model: string;
  maxSteps: number;
  yesWrites: boolean;
}

export function getConfigFilePath(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "harness", "config.json");
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "harness", "config.json");
}

export function loadConfigFile(customPath?: string): ConfigFileData {
  const filePath = customPath || getConfigFilePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = ConfigFileSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch {
    // If invalid JSON, treat as empty
  }
  return {};
}

export function saveConfigFile(data: ConfigFileData, customPath?: string): void {
  const filePath = customPath || getConfigFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, serialized, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Ignore permissions failure on platforms that do not support POSIX modes
  }
}

export interface LoadConfigOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxSteps?: number;
  yesWrites?: boolean;
  configPath?: string;
}

export function loadConfig(options: LoadConfigOptions = {}): HarnessConfig {
  const fileConfig = loadConfigFile(options.configPath);

  const rawKey =
    options.apiKey ||
    process.env.HARNESS_API_KEY ||
    fileConfig.apiKey;

  if (!rawKey) {
    throw new Error(
      "API key not set. Export HARNESS_API_KEY or run harness --setup."
    );
  }

  const baseUrl =
    options.baseUrl ||
    process.env.HARNESS_BASE_URL ||
    fileConfig.baseUrl ||
    "https://api.openai.com/v1";

  const model =
    options.model ||
    process.env.HARNESS_MODEL ||
    fileConfig.model ||
    "gpt-4o";

  const maxSteps =
    options.maxSteps ??
    (process.env.HARNESS_MAX_STEPS ? parseInt(process.env.HARNESS_MAX_STEPS, 10) : undefined) ??
    fileConfig.maxSteps ??
    25;

  const yesWrites = options.yesWrites ?? false;

  return {
    apiKey: new Secret(rawKey),
    baseUrl,
    model,
    maxSteps,
    yesWrites,
  };
}
