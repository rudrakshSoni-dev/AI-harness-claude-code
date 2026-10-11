import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Sandbox, SandboxError } from "../src/sandbox.js";

describe("Sandbox", () => {
  let tempDir: string;
  let outsideDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-sandbox-test-"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-outside-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it("resolves valid paths inside the workspace", () => {
    const sandbox = new Sandbox(tempDir);
    const subfile = path.join(tempDir, "hello.txt");
    fs.writeFileSync(subfile, "world");

    const resolved = sandbox.resolve("hello.txt");
    expect(resolved).toBe(fs.realpathSync(subfile));
    expect(sandbox.toRelative(resolved)).toBe("hello.txt");
  });

  it("resolves non-existent file paths destined for creation inside workspace", () => {
    const sandbox = new Sandbox(tempDir);
    fs.mkdirSync(path.join(tempDir, "src"));

    const resolved = sandbox.resolve("src/newfile.ts");
    expect(resolved).toBe(path.join(fs.realpathSync(tempDir), "src", "newfile.ts"));
    expect(sandbox.toRelative(resolved)).toBe("src/newfile.ts");
  });

  it("rejects path traversal attempts with ..", () => {
    const sandbox = new Sandbox(tempDir);
    expect(() => sandbox.resolve("../escaped.txt")).toThrow(SandboxError);
    expect(() => sandbox.resolve("sub/../../escaped.txt")).toThrow(SandboxError);
    expect(() => sandbox.resolve("../../../etc/passwd")).toThrow(SandboxError);
  });

  it("rejects absolute paths outside workspace", () => {
    const sandbox = new Sandbox(tempDir);
    expect(() => sandbox.resolve(outsideDir)).toThrow(SandboxError);
    expect(() => sandbox.resolve("/etc/passwd")).toThrow(SandboxError);
  });

  it("rejects symlinks that point outside the workspace", () => {
    const sandbox = new Sandbox(tempDir);
    const outsideFile = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(outsideFile, "secret");

    const symlinkPath = path.join(tempDir, "leak-link");
    fs.symlinkSync(outsideFile, symlinkPath);

    expect(() => sandbox.resolve("leak-link")).toThrow(SandboxError);
  });

  it("allows symlinks that point inside the workspace", () => {
    const sandbox = new Sandbox(tempDir);
    const insideTarget = path.join(tempDir, "target.txt");
    fs.writeFileSync(insideTarget, "safe content");

    const symlinkPath = path.join(tempDir, "safe-link");
    fs.symlinkSync(insideTarget, symlinkPath);

    const resolved = sandbox.resolve("safe-link");
    expect(resolved).toBe(fs.realpathSync(insideTarget));
  });
});
