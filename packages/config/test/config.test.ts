import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { Secret, loadConfig, saveConfigFile, loadConfigFile } from "../src/index.js";

describe("Secret", () => {
  it("never prints the secret key in toString, toJSON or util.inspect", () => {
    const secret = new Secret("super-secret-key-12345");
    expect(secret.toString()).toBe("[redacted]");
    expect(secret.toJSON()).toBe("[redacted]");
    expect(util.inspect(secret)).toBe("[redacted]");
    expect(JSON.stringify({ key: secret })).toBe('{"key":"[redacted]"}');
    expect(`${secret}`).toBe("[redacted]");
    expect(secret.reveal()).toBe("super-secret-key-12345");
  });
});

describe("Config Loader", () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HARNESS_API_KEY;
    delete process.env.HARNESS_BASE_URL;
    delete process.env.HARNESS_MODEL;
    delete process.env.HARNESS_MAX_STEPS;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-config-test-"));
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("throws clear error when API key is missing", () => {
    const configPath = path.join(tempDir, "config.json");
    expect(() => loadConfig({ configPath })).toThrow(/API key not set/);
  });

  it("loads API key and options from environment variables", () => {
    process.env.HARNESS_API_KEY = "env-key";
    process.env.HARNESS_BASE_URL = "https://custom.endpoint/v1";
    process.env.HARNESS_MODEL = "custom-model";
    process.env.HARNESS_MAX_STEPS = "40";

    const config = loadConfig();
    expect(config.apiKey.reveal()).toBe("env-key");
    expect(config.apiKey.toString()).toBe("[redacted]");
    expect(config.baseUrl).toBe("https://custom.endpoint/v1");
    expect(config.model).toBe("custom-model");
    expect(config.maxSteps).toBe(40);
  });

  it("loads configuration from file and persists with saveConfigFile", () => {
    const configPath = path.join(tempDir, "config.json");
    saveConfigFile(
      {
        apiKey: "file-key",
        baseUrl: "https://file.endpoint/v1",
        model: "file-model",
        maxSteps: 15,
      },
      configPath
    );

    const loadedFile = loadConfigFile(configPath);
    expect(loadedFile.apiKey).toBe("file-key");

    const config = loadConfig({ configPath });
    expect(config.apiKey.reveal()).toBe("file-key");
    expect(config.baseUrl).toBe("https://file.endpoint/v1");
    expect(config.model).toBe("file-model");
    expect(config.maxSteps).toBe(15);
  });
});
