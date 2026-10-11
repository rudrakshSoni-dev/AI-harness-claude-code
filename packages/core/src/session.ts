import { Sandbox } from "@harness/sandbox";
import { HarnessConfig } from "@harness/config";
import { ToolRegistry } from "@harness/tools";
import { LlmClient, Message } from "@harness/llm";

export interface SessionStepEvent {
  step: number;
  toolName: string;
  toolArgs: unknown;
}

export interface Session {
  llm: LlmClient;
  tools: ToolRegistry;
  sandbox: Sandbox;
  config: HarnessConfig;
  history: Message[];
  approve: (prompt: string) => Promise<boolean>;
  signal: AbortSignal;
  onStep?: (event: SessionStepEvent) => void;
}
