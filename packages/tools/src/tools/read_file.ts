import fs from "node:fs";
import { z } from "zod";
import { Tool, ToolContext, ToolResult } from "../tool.js";

const MAX_FILE_BYTES = 250 * 1024; // 250 KB cap

export const ReadFileArgs = z.object({
  path: z.string().describe("Relative path of the file to read"),
  offset: z.number().int().min(1).optional().describe("1-indexed line number to start reading from"),
  limit: z.number().int().min(1).optional().describe("Maximum number of lines to return"),
});

export const readFileTool: Tool<typeof ReadFileArgs> = {
  name: "read_file",
  description: "Read file contents at a relative path in the workspace",
  args: ReadFileArgs,
  needsApproval: false,
  async run(args: z.infer<typeof ReadFileArgs>, ctx: ToolContext): Promise<ToolResult> {
    const resolved = ctx.sandbox.resolve(args.path);
    if (!fs.existsSync(resolved)) {
      return { ok: false, output: `File not found: ${args.path}` };
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return { ok: false, output: `Path is a directory, not a file: ${args.path}` };
    }

    if (stat.size > MAX_FILE_BYTES && !args.limit) {
      return {
        ok: false,
        output: `File is too large (${stat.size} bytes > ${MAX_FILE_BYTES} bytes limit). Specify offset and limit to read in chunks.`,
      };
    }

    const content = fs.readFileSync(resolved, "utf-8");
    const lines = content.split(/\r?\n/);

    const startLine = args.offset ? Math.max(1, args.offset) : 1;
    const startIndex = startLine - 1;
    const lineLimit = args.limit ?? lines.length;

    const slice = lines.slice(startIndex, startIndex + lineLimit);
    const formatted = slice
      .map((line, idx) => `${startIndex + idx + 1}: ${line}`)
      .join("\n");

    return { ok: true, output: formatted };
  },
};
