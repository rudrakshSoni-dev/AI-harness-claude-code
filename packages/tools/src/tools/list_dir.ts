import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Tool, ToolContext, ToolResult } from "../tool.js";

export const ListDirArgs = z.object({
  path: z.string().optional().default(".").describe("Relative path of the directory to list"),
});

export const listDirTool: Tool<typeof ListDirArgs> = {
  name: "list_dir",
  description: "List directory contents under a relative path in the workspace",
  args: ListDirArgs,
  needsApproval: false,
  async run(args: z.infer<typeof ListDirArgs>, ctx: ToolContext): Promise<ToolResult> {
    const resolved = ctx.sandbox.resolve(args.path);
    if (!fs.existsSync(resolved)) {
      return { ok: false, output: `Directory not found: ${args.path}` };
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, output: `Path is not a directory: ${args.path}` };
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    if (entries.length === 0) {
      return { ok: true, output: `(Directory "${args.path}" is empty)` };
    }

    const formatted = entries
      .map((entry) => {
        const type = entry.isDirectory() ? "DIR " : entry.isSymbolicLink() ? "LINK" : "FILE";
        return `${type}  ${entry.name}`;
      })
      .join("\n");

    return { ok: true, output: formatted };
  },
};
