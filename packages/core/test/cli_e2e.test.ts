import { describe, it, expect } from "vitest";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("CLI End-to-End Test", () => {
  it("runs full agent loop through the CLI binary against a local mock server", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-e2e-"));
    const cliEntry = path.resolve(__dirname, "../../../apps/cli/dist/index.js");

    let callCount = 0;
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", () => {
        callCount++;
        let reply;

        if (callCount === 1) {
          // Model calls list_dir
          reply = {
            id: "call-1",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "tc_1",
                      type: "function",
                      function: {
                        name: "list_dir",
                        arguments: JSON.stringify({ path: "." }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          };
        } else if (callCount === 2) {
          // Model calls write_file
          reply = {
            id: "call-2",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "tc_2",
                      type: "function",
                      function: {
                        name: "write_file",
                        arguments: JSON.stringify({
                          path: "greeting.txt",
                          content: "Hello from verified harness!\n",
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
          };
        } else {
          // Model finishes
          reply = {
            id: "call-3",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Created greeting.txt with requested content.",
                },
              },
            ],
            usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
          };
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as any).port;
    const mockBaseUrl = `http://127.0.0.1:${port}`;

    try {
      const child = spawn(
        process.execPath,
        [cliEntry, "--dir", tempDir, "--yes-writes"],
        {
          env: {
            ...process.env,
            HARNESS_API_KEY: "mock-e2e-key",
            HARNESS_BASE_URL: mockBaseUrl,
            NO_COLOR: "1",
          },
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        // Once CLI prompts for input, send goal
        if (stdout.includes("Type a goal to begin") && !stdout.includes("greeting.txt")) {
          child.stdin.write("Please create greeting.txt\n");
        }
        // Once done, exit REPL
        if (stdout.includes("[done] Task completed")) {
          child.stdin.write("exit\n");
        }
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", (code) => resolve(code ?? 0));
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("[step 1] list_dir .");
      expect(stdout).toContain("[step 2] write_file greeting.txt");
      expect(stdout).toContain("Created greeting.txt with requested content.");
      expect(stdout).toContain("[done] Task completed in 3 steps");

      // Verify the file was physically written to disk
      const createdFile = path.join(tempDir, "greeting.txt");
      expect(fs.existsSync(createdFile)).toBe(true);
      expect(fs.readFileSync(createdFile, "utf-8")).toBe("Hello from verified harness!\n");
    } finally {
      server.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
