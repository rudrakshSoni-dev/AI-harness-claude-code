import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Tool, ToolContext, ToolResult } from "../tool.js";

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
const MAX_SEARCH_MATCHES = 50;

export const SearchArgs = z.object({
  query: z.string().describe("Substring or regular expression to search for"),
  path: z.string().optional().default(".").describe("Subdirectory path to search within"),
  isRegex: z.boolean().optional().default(false).describe("Whether query is a regex"),
});

export const searchTool: Tool<typeof SearchArgs> = {
  name: "search",
  description: "Search for a substring or regex pattern across workspace files",
  args: SearchArgs,
  needsApproval: false,
  async run(args: z.infer<typeof SearchArgs>, ctx: ToolContext): Promise<ToolResult> {
    const root = ctx.sandbox.resolve(args.path);
    if (!fs.existsSync(root)) {
      return { ok: false, output: `Search path not found: ${args.path}` };
    }

    let regex: RegExp;
    try {
      regex = args.isRegex ? new RegExp(args.query, "i") : new RegExp(escapeRegex(args.query), "i");
    } catch (err: any) {
      return { ok: false, output: `Invalid regex pattern: ${err.message}` };
    }

    const matches: string[] = [];

    function walk(dir: string): void {
      if (matches.length >= MAX_SEARCH_MATCHES) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= MAX_SEARCH_MATCHES) break;

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) {
            walk(path.join(dir, entry.name));
          }
          continue;
        }

        if (entry.isFile()) {
          const filePath = path.join(dir, entry.name);
          try {
            const stat = fs.statSync(filePath);
            if (stat.size > 500 * 1024) continue; // Skip huge files

            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split(/\r?\n/);
            const relativePath = ctx.sandbox.toRelative(filePath);

            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
                if (matches.length >= MAX_SEARCH_MATCHES) break;
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    walk(root);

    if (matches.length === 0) {
      return { ok: true, output: `No matches found for "${args.query}".` };
    }

    let output = matches.join("\n");
    if (matches.length >= MAX_SEARCH_MATCHES) {
      output += `\n... (capped at ${MAX_SEARCH_MATCHES} matches)`;
    }

    return { ok: true, output };
  },
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
