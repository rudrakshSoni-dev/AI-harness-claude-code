import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Secret } from "@harness/config";
import { FetchLlmClient, FakeLlm } from "../src/index.js";

describe("FetchLlmClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends proper headers and parses OpenAI-compatible response", async () => {
    const mockResponse = {
      id: "chatcmpl-123",
      choices: [
        {
          message: {
            role: "assistant",
            content: "I will check the directory",
            tool_calls: [
              {
                id: "call_abc",
                type: "function",
                function: {
                  name: "list_dir",
                  arguments: JSON.stringify({ path: "." }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: {
        prompt_tokens: 25,
        completion_tokens: 15,
        total_tokens: 40,
      },
    };

    let requestedHeaders: HeadersInit | undefined;
    let requestedBody: any;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://mock.api/v1/chat/completions");
      requestedHeaders = init?.headers;
      requestedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        json: async () => mockResponse,
      } as Response;
    });

    const client = new FetchLlmClient({
      baseUrl: "https://mock.api/v1",
      model: "gpt-4o",
      apiKey: new Secret("sk-test-secret-key"),
    });

    const res = await client.complete([{ role: "user", content: "list files" }], [
      { type: "function", function: { name: "list_dir" } },
    ]);

    expect((requestedHeaders as any)["Authorization"]).toBe("Bearer sk-test-secret-key");
    expect(requestedBody.model).toBe("gpt-4o");
    expect(res.text).toBe("I will check the directory");
    expect(res.toolCalls.length).toBe(1);
    expect(res.toolCalls[0].name).toBe("list_dir");
    expect(res.usage?.totalTokens).toBe(40);
  });

  it("handles provider HTTP error cleanly", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid API key",
      } as Response;
    });

    const client = new FetchLlmClient({
      baseUrl: "https://mock.api/v1",
      model: "gpt-4o",
      apiKey: new Secret("invalid-key"),
    });

    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(
      /LLM provider error \(401 Unauthorized\)/
    );
  });
});

describe("FakeLlm", () => {
  it("delivers scripted responses in order", async () => {
    const fake = new FakeLlm([
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "read_file", arguments: '{"path":"a.ts"}' },
            },
          ],
        },
        toolCalls: [{ id: "call_1", name: "read_file", args: '{"path":"a.ts"}' }],
      },
      {
        message: { role: "assistant", content: "I am finished." },
        text: "I am finished.",
        toolCalls: [],
      },
    ]);

    const step1 = await fake.complete([{ role: "user", content: "test" }]);
    expect(step1.toolCalls.length).toBe(1);
    expect(step1.toolCalls[0].name).toBe("read_file");

    const step2 = await fake.complete([{ role: "user", content: "next" }]);
    expect(step2.toolCalls.length).toBe(0);
    expect(step2.text).toBe("I am finished.");

    expect(fake.getCallCount()).toBe(2);
  });
});
