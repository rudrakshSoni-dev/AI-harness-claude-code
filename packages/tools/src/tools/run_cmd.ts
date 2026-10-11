import { spawn } from "node:child_process";
import { z } from "zod";
import { Tool, ToolContext, ToolResult } from "../tool.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 100 * 1024;

export const RunCmdArgs = z.object({
  command: z.string().describe("Shell command to run in the workspace root"),
});

export const runCmdTool: Tool<typeof RunCmdArgs> = {
  name: "run_cmd",
  description: "Execute a shell command inside the workspace directory (requires explicit user confirmation)",
  args: RunCmdArgs,
  needsApproval: true,
  async run(args: z.infer<typeof RunCmdArgs>, ctx: ToolContext): Promise<ToolResult> {
    const prompt = `Execute command in workspace (${ctx.sandbox.workspaceRoot}):\n  $ ${args.command}\n\nAllow execution? [y/N]`;
    const approved = await ctx.approve(prompt);
    if (!approved) {
      return { ok: false, output: `Command execution rejected by user: "${args.command}"` };
    }

    return new Promise<ToolResult>((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let finished = false;

      const controller = new AbortController();
      const combinedSignal = ctx.signal;

      const timer = setTimeout(() => {
        if (!finished) {
          controller.abort();
          finish({
            ok: false,
            output: `Command timed out after ${DEFAULT_TIMEOUT_MS / 1000} seconds: "${args.command}"\nOutput before timeout:\n${stdoutBuf}`,
          });
        }
      }, DEFAULT_TIMEOUT_MS);

      const onAbort = () => {
        controller.abort();
        finish({
          ok: false,
          output: `Command aborted by user: "${args.command}"`,
        });
      };

      if (combinedSignal) {
        combinedSignal.addEventListener("abort", onAbort, { once: true });
      }

      function finish(result: ToolResult) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (combinedSignal) {
          combinedSignal.removeEventListener("abort", onAbort);
        }
        resolve(result);
      }

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(args.command, {
          shell: true,
          cwd: ctx.sandbox.workspaceRoot,
          signal: controller.signal,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (err: any) {
        finish({ ok: false, output: `Failed to spawn process: ${err.message}` });
        return;
      }

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdoutBuf.length < MAX_OUTPUT_BYTES) {
          stdoutBuf += chunk.toString("utf-8");
          if (stdoutBuf.length > MAX_OUTPUT_BYTES) {
            stdoutBuf = stdoutBuf.slice(0, MAX_OUTPUT_BYTES);
            stdoutTruncated = true;
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderrBuf.length < MAX_OUTPUT_BYTES) {
          stderrBuf += chunk.toString("utf-8");
          if (stderrBuf.length > MAX_OUTPUT_BYTES) {
            stderrBuf = stderrBuf.slice(0, MAX_OUTPUT_BYTES);
            stderrTruncated = true;
          }
        }
      });

      child.on("error", (err: any) => {
        finish({
          ok: false,
          output: `Command execution error: ${err.message}`,
        });
      });

      child.on("close", (code: number | null, signalStr: string | null) => {
        let output = "";
        if (stdoutBuf) output += stdoutBuf;
        if (stdoutTruncated) output += "\n... (stdout capped at 100 KB)";
        if (stderrBuf) {
          if (output) output += "\n--- STDERR ---\n";
          output += stderrBuf;
          if (stderrTruncated) output += "\n... (stderr capped at 100 KB)";
        }

        const isSuccess = code === 0;
        const statusMsg = isSuccess
          ? `Command completed successfully (exit code 0).`
          : `Command exited with code ${code ?? signalStr ?? "unknown"}.`;

        finish({
          ok: isSuccess,
          output: output.trim() ? `${statusMsg}\nOutput:\n${output.trim()}` : statusMsg,
        });
      });
    });
  },
};
