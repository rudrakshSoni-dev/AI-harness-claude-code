export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCallItem {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: MessageRole;
  content?: string | null;
  tool_calls?: ToolCallItem[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmCompletionResponse {
  message: Message;
  text?: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: string;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LlmClient {
  complete(
    messages: Message[],
    tools?: unknown[],
    signal?: AbortSignal
  ): Promise<LlmCompletionResponse>;
}
