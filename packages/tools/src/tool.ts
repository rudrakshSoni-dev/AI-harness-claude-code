import { z } from "zod";
import { Sandbox } from "@harness/sandbox";

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface ToolContext {
  sandbox: Sandbox;
  approve: (prompt: string) => Promise<boolean>;
  signal: AbortSignal;
}

export interface Tool<A extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  args: A;
  needsApproval: boolean;
  run(args: z.infer<A>, ctx: ToolContext): Promise<ToolResult>;
}
