import { LlmClient, Message, LlmCompletionResponse } from "./types.js";

export class FakeLlm implements LlmClient {
  private readonly scriptedResponses: LlmCompletionResponse[];
  private callCount = 0;
  readonly receivedCalls: Array<{ messages: Message[]; tools?: unknown[] }> = [];

  constructor(responses: LlmCompletionResponse[] = []) {
    this.scriptedResponses = [...responses];
  }

  async complete(
    messages: Message[],
    tools?: unknown[],
    _signal?: AbortSignal
  ): Promise<LlmCompletionResponse> {
    this.receivedCalls.push({ messages, tools });
    if (this.callCount >= this.scriptedResponses.length) {
      return {
        message: { role: "assistant", content: "Done." },
        text: "Done.",
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    }
    return this.scriptedResponses[this.callCount++];
  }

  getCallCount(): number {
    return this.callCount;
  }
}
