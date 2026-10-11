import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Sandbox } from "@harness/sandbox";
import {
  createDefaultRegistry,
  ToolRegistry,
  listDirTool,
  readFileTool,
  searchTool,
  writeFileTool,
  createWriteFileTool,
  runCmdTool,
} from "../src/index.js";

describe("ToolRegistry", () => {
  it("converts tool schemas to valid OpenAI-compatible function definitions", () => {
    const registry = createDefaultRegistry();
    const schemas = registry.schemas();

    expect(schemas.length).toBe(5);
    const names = schemas.map((s) => s.function.name);
    expect(names).toContain("list_dir");
    expect(names).toContain("read_file");
    expect(names).toContain("search");
    expect(names).toContain("write_file");
    expect(names).toContain("run_cmd");

    const writeFileSchema = schemas.find((s) => s.function.name === "write_file");
    expect(writeFileSchema?.function.parameters.type).toBe("object");
    expect((writeFileSchema?.function.parameters as any).properties.path.type).toBe("string");
    expect((writeFileSchema?.function.parameters as any).properties.content.type).toBe("string");
  });

  it("handles unknown tool and invalid arguments safely", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-reg-test-"));
    const sandbox = new Sandbox(tempDir);
    const registry = createDefaultRegistry();
    const controller = new AbortController();

    const unknownRes = await registry.execute(
      { id: "1", name: "unknown_tool", args: {} },
      sandbox,
      async () => true,
      controller.signal
    );
    expect(unknownRes.ok).toBe(false);
    expect(unknownRes.output).toContain("Unknown tool");

    const badArgRes = await registry.execute(
      { id: "2", name: "read_file", args: "not-json" },
      sandbox,
      async () => true,
      controller.signal
    );
    expect(badArgRes.ok).toBe(false);
    expect(badArgRes.output).toContain("Malformed JSON");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe("Individual Tools", () => {
  let tempDir: string;
  let sandbox: Sandbox;
  let controller: AbortController;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-tools-test-"));
    sandbox = new Sandbox(tempDir);
    controller = new AbortController();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("list_dir lists entries accurately", async () => {
    fs.writeFileSync(path.join(tempDir, "a.txt"), "hello");
    fs.mkdirSync(path.join(tempDir, "sub"));

    const res = await listDirTool.run({ path: "." }, { sandbox, approve: async () => true, signal: controller.signal });
    expect(res.ok).toBe(true);
    expect(res.output).toContain("a.txt");
    expect(res.output).toContain("sub");
  });

  it("read_file returns line-numbered content and slices", async () => {
    const file = path.join(tempDir, "lines.txt");
    fs.writeFileSync(file, "line1\nline2\nline3\nline4\nline5");

    const res = await readFileTool.run(
      { path: "lines.txt", offset: 2, limit: 2 },
      { sandbox, approve: async () => true, signal: controller.signal }
    );
    expect(res.ok).toBe(true);
    expect(res.output).toBe("2: line2\n3: line3");
  });

  it("search locates strings across files", async () => {
    fs.writeFileSync(path.join(tempDir, "test.txt"), "special_target_token in text");
    fs.writeFileSync(path.join(tempDir, "other.txt"), "nothing to see here");

    const res = await searchTool.run(
      { query: "special_target_token", path: ".", isRegex: false },
      { sandbox, approve: async () => true, signal: controller.signal }
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain("test.txt:1: special_target_token in text");
  });

  it("write_file prompts for approval and renders unified diff", async () => {
    let approvalPrompt = "";
    const tool = createWriteFileTool({ yesWrites: false });

    // 1. Rejected write
    const rejectRes = await tool.run(
      { path: "sample.txt", content: "initial content\n" },
      {
        sandbox,
        approve: async (p) => {
          approvalPrompt = p;
          return false;
        },
        signal: controller.signal,
      }
    );
    expect(rejectRes.ok).toBe(false);
    expect(approvalPrompt).toContain("+initial content");
    expect(fs.existsSync(path.join(tempDir, "sample.txt"))).toBe(false);

    // 2. Approved write
    const acceptRes = await tool.run(
      { path: "sample.txt", content: "initial content\n" },
      {
        sandbox,
        approve: async () => true,
        signal: controller.signal,
      }
    );
    expect(acceptRes.ok).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, "sample.txt"), "utf-8")).toBe("initial content\n");
  });

  it("run_cmd asks for confirmation and runs in workspace", async () => {
    // 1. User rejects
    const rejectRes = await runCmdTool.run(
      { command: "echo approved" },
      {
        sandbox,
        approve: async () => false,
        signal: controller.signal,
      }
    );
    expect(rejectRes.ok).toBe(false);
    expect(rejectRes.output).toContain("rejected by user");

    // 2. User approves
    const acceptRes = await runCmdTool.run(
      { command: "echo approved_cmd_output" },
      {
        sandbox,
        approve: async () => true,
        signal: controller.signal,
      }
    );
    expect(acceptRes.ok).toBe(true);
    expect(acceptRes.output).toContain("approved_cmd_output");
  });
});
