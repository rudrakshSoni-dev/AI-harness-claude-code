import { z } from "zod";
import { Sandbox } from "@harness/sandbox";
import { Tool, ToolContext, ToolResult } from "./tool.js";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown> | string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  let unwrapped = schema;
  while (
    unwrapped instanceof z.ZodOptional ||
    unwrapped instanceof z.ZodNullable ||
    unwrapped instanceof z.ZodDefault
  ) {
    if (unwrapped instanceof z.ZodDefault) {
      unwrapped = (unwrapped as any)._def.innerType;
    } else {
      unwrapped = (unwrapped as any).unwrap();
    }
  }

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(shape)) {
      const field = val as z.ZodTypeAny;
      const jsonProp = zodToJsonSchema(field);
      if (field.description) {
        jsonProp.description = field.description;
      }
      properties[key] = jsonProp;
      if (!field.isOptional()) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = {
      type: "object",
      properties,
    };
    if (required.length > 0) {
      result.required = required;
    }
    return result;
  }

  if (unwrapped instanceof z.ZodString) {
    return { type: "string" };
  }
  if (unwrapped instanceof z.ZodNumber) {
    return { type: "number" };
  }
  if (unwrapped instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }
  if (unwrapped instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema((unwrapped as any).element),
    };
  }

  return { type: "string" };
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  schemas(): ToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.args),
      },
    }));
  }

  async execute(
    call: ToolCall,
    sandbox: Sandbox,
    approve: (prompt: string) => Promise<boolean>,
    signal: AbortSignal
  ): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      const available = Array.from(this.tools.keys()).join(", ");
      return {
        ok: false,
        output: `Error: Unknown tool "${call.name}". Available tools: ${available}`,
      };
    }

    let parsedArgs: unknown = call.args;
    if (typeof call.args === "string") {
      try {
        parsedArgs = JSON.parse(call.args);
      } catch (err: any) {
        return {
          ok: false,
          output: `Error: Malformed JSON arguments for tool "${call.name}": ${err.message}`,
        };
      }
    }

    const validation = tool.args.safeParse(parsedArgs ?? {});
    if (!validation.success) {
      const errors = validation.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      return {
        ok: false,
        output: `Error: Invalid arguments for tool "${call.name}": ${errors}`,
      };
    }

    const ctx: ToolContext = {
      sandbox,
      approve,
      signal,
    };

    try {
      return await tool.run(validation.data, ctx);
    } catch (err: any) {
      return {
        ok: false,
        output: `Error executing tool "${call.name}": ${err.message || String(err)}`,
      };
    }
  }
}
