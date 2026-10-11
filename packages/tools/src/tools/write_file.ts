import fs from "node:fs";
import path from "node:path";
import * as diff from "diff";
import { z } from "zod";
import { Tool, ToolContext, ToolResult } from "../tool.js";

export const WriteFileArgs = z.object({
  path: z.string().describe("Relative path of the file to write"),
  content: z.string().describe("Complete new content to write to the file"),
});

export function createWriteFileTool(options: { yesWrites?: boolean } = {}): Tool<typeof WriteFileArgs> {
  const autoApprove = options.yesWrites ?? false;

  return {
    name: "write_file",
    description: "Create or overwrite a file at a relative path in the workspace",
    args: WriteFileArgs,
    needsApproval: !autoApprove,
    async run(args: z.infer<typeof WriteFileArgs>, ctx: ToolContext): Promise<ToolResult> {
      const resolved = ctx.sandbox.resolve(args.path);
      const relative = ctx.sandbox.toRelative(resolved);

      const oldContent = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf-8") : "";
      const isNew = !fs.existsSync(resolved);

      const patch = diff.createTwoFilesPatch(
        isNew ? "/dev/null" : `a/${relative}`,
        `b/${relative}`,
        oldContent,
        args.content,
        isNew ? "(new file)" : "before",
        "after"
      );

      if (!autoApprove) {
        const prompt = `Proposed change to ${relative}:\n\n${patch}\n\nApply this change? [y/N]`;
        const approved = await ctx.approve(prompt);
        if (!approved) {
          return { ok: false, output: `Write to "${relative}" rejected by user.` };
        }
      }

      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Safe write: write to temp file then rename
      const tempPath = `${resolved}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, args.content, "utf-8");
      fs.renameSync(tempPath, resolved);

      return {
        ok: true,
        output: `Successfully wrote ${relative} (${args.content.length} bytes).\nDiff:\n${patch}`,
      };
    },
  };
}

export const writeFileTool = createWriteFileTool();
