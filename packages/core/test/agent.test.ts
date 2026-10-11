import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Sandbox } from "@harness/sandbox";
import { Secret, HarnessConfig } from "@harness/config";
import { createDefaultRegistry } from "@harness/tools";
import { FakeLlm } from "@harness/llm";
import { runAgent, Session } from "../src/index.js";

describe("runAgent with FakeLlm", () => {
  let tempDir: string;
  let sandbox: Sandbox;
  let config: HarnessConfig;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-core-test-"));
    sandbox = new Sandbox(tempDir);
    config = {
      apiKey: new Secret("test-key"),
      baseUrl: "https://api.mock/v1",
      model: "test-model",
      maxSteps: 5,
      yesWrites: true,
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("completes immediately when model has no tool calls", async () => {
    const fake = new FakeLlm([
      {
        message: { role: "assistant", content: "I solved it!" },
        text: "I solved it!",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ]);

    const session: Session = {
      llm: fake,
      tools: createDefaultRegistry(),
      sandbox,
      config,
      history: [],
      approve: async () => true,
      signal: new AbortController().signal,
    };

    const result = await runAgent(session, "Help me write code");
    expect(result.status).toBe("done");
    expect(result.text).toBe("I solved it!");
    expect(result.steps).toBe(1);
    expect(result.totalTokens).toBe(15);
    expect(session.history.length).toBe(2); // user goal + assistant reply
  });

  it("executes multi-step tool calls and reports steps", async () => {
    fs.writeFileSync(path.join(tempDir, "sample.txt"), "hello world");

    const stepsLogged: string[] = [];
    const fake = new FakeLlm([
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "sample.txt" }),
              },
            },
          ],
        },
        toolCalls: [
          {
            id: "call_1",
            name: "read_file",
            args: JSON.stringify({ path: "sample.txt" }),
          },
        ],
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
      },
      {
        message: { role: "assistant", content: "The file contains hello world." },
        text: "The file contains hello world.",
        toolCalls: [],
        usage: { promptTokens: 35, completionTokens: 15, totalTokens: 50 },
      },
    ]);

    const session: Session = {
      llm: fake,
      tools: createDefaultRegistry(),
      sandbox,
      config,
      history: [],
      approve: async () => true,
      signal: new AbortController().signal,
      onStep: (e) => stepsLogged.push(`${e.step}:${e.toolName}`),
    };

    const result = await runAgent(session, "What is inside sample.txt?");
    expect(result.status).toBe("done");
    expect(result.text).toBe("The file contains hello world.");
    expect(result.steps).toBe(2);
    expect(result.totalTokens).toBe(80);
    expect(stepsLogged).toEqual(["1:read_file"]);

    // Verify history contains: user, assistant (tool call), tool (result), assistant (final)
    expect(session.history.length).toBe(4);
    expect(session.history[0].role).toBe("user");
    expect(session.history[1].role).toBe("assistant");
    expect(session.history[2].role).toBe("tool");
    expect(session.history[2].content).toContain("hello world");
    expect(session.history[3].role).toBe("assistant");
  });

  it("enforces maxSteps limit when model calls tools indefinitely", async () => {
    // Generate endless tool calls
    const infiniteCalls = Array.from({ length: 10 }).map((_, i) => ({
      message: {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: `call_${i}`,
            type: "function" as const,
            function: {
              name: "list_dir",
              arguments: JSON.stringify({ path: "." }),
            },
          },
        ],
      },
      toolCalls: [
        {
          id: `call_${i}`,
          name: "list_dir",
          args: JSON.stringify({ path: "." }),
        },
      ],
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    }));

    const fake = new FakeLlm(infiniteCalls);
    const session: Session = {
      llm: fake,
      tools: createDefaultRegistry(),
      sandbox,
      config: { ...config, maxSteps: 3 },
      history: [],
      approve: async () => true,
      signal: new AbortController().signal,
    };

    const result = await runAgent(session, "Loop forever");
    expect(result.status).toBe("step_limit_reached");
    expect(result.steps).toBe(3);
  });

  it("respects AbortSignal and aborts promptly", async () => {
    const controller = new AbortController();
    controller.abort();

    const fake = new FakeLlm([]);
    const session: Session = {
      llm: fake,
      tools: createDefaultRegistry(),
      sandbox,
      config,
      history: [],
      approve: async () => true,
      signal: controller.signal,
    };

    const result = await runAgent(session, "Should abort");
    expect(result.status).toBe("aborted");
  });
});
