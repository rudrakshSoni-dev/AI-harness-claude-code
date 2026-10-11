import { z } from "zod";
import { HarnessConfig } from "@harness/config";
import { LlmClient, Message, LlmCompletionResponse } from "./types.js";

const ApiResponseSchema = z.object({
  id: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({
        role: z.enum(["assistant", "user", "system", "tool"]).default("assistant"),
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal("function"),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            })
          )
          .optional(),
      }),
      finish_reason: z.string().nullable().optional(),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

export class FetchLlmClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKeyRaw: string;

  constructor(config: Pick<HarnessConfig, "baseUrl" | "model" | "apiKey">) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.model = config.model;
    this.apiKeyRaw = config.apiKey.reveal();
  }

  async complete(
    messages: Message[],
    tools?: unknown[],
    signal?: AbortSignal
  ): Promise<LlmCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };

    if (tools && Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKeyRaw}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("LLM request aborted.");
      }
      throw new Error(`LLM network error connecting to ${this.baseUrl}: ${err.message}`);
    }

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }
      throw new Error(
        `LLM provider error (${response.status} ${response.statusText}): ${errorBody || "Unknown error"}`
      );
    }

    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch (err: any) {
      throw new Error(`Invalid JSON response from LLM provider: ${err.message}`);
    }

    const parsed = ApiResponseSchema.safeParse(rawJson);
    if (!parsed.success) {
      const issueDetails = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Failed to validate LLM response schema: ${issueDetails}`);
    }

    const choice = parsed.data.choices[0];
    if (!choice) {
      throw new Error("LLM provider returned empty choices array.");
    }

    const toolCalls =
      choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: tc.function.arguments,
      })) ?? [];

    return {
      message: {
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      },
      text: choice.message.content || undefined,
      toolCalls,
      usage: parsed.data.usage
        ? {
            promptTokens: parsed.data.usage.prompt_tokens ?? 0,
            completionTokens: parsed.data.usage.completion_tokens ?? 0,
            totalTokens: parsed.data.usage.total_tokens ?? 0,
          }
        : undefined,
    };
  }
}
