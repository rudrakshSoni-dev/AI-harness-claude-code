#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  loadConfig,
  saveConfigFile,
  getConfigFilePath,
  HarnessConfig,
} from "@harness/config";
import { Sandbox } from "@harness/sandbox";
import { createDefaultRegistry } from "@harness/tools";
import { FetchLlmClient } from "@harness/llm";
import { runAgent, Session } from "@harness/core";

// Colors (only if stdout is a TTY and NO_COLOR is not set)
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const color = {
  cyan: (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
};

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `~${(count / 1000).toFixed(1)}k tokens`;
  }
  return `${count} tokens`;
}

function printHelp(): void {
  console.log(`
${color.bold("AI Coding Harness")} - Bring your own key. Point it at a directory. Let it code.

${color.bold("Usage:")}
  harness [options]

${color.bold("Options:")}
  --dir <path>        Workspace directory to jail agent to (default: current directory)
  --model <name>      LLM model identifier (default: gpt-4o or HARNESS_MODEL)
  --max-steps <N>     Maximum agent steps per task (default: 25)
  --yes-writes        Auto-approve file write modifications without prompt
  --setup             Configure and save your API key securely
  -h, --help          Show this help text
`);
}

async function runSetup(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(color.bold("\n--- AI Harness Setup ---"));
    console.log("Your API key is stored locally in your user config with mode 0o600.\n");

    const apiKey = (await rl.question("Enter your LLM API Key: ")).trim();
    if (!apiKey) {
      console.log(color.red("Setup cancelled: No API key provided."));
      return;
    }

    const defaultUrl = "https://api.openai.com/v1";
    const baseUrlInput = (
      await rl.question(`Base URL (press Enter for ${defaultUrl}): `)
    ).trim();
    const baseUrl = baseUrlInput || defaultUrl;

    const defaultModel = "gpt-4o";
    const modelInput = (
      await rl.question(`Default Model (press Enter for ${defaultModel}): `)
    ).trim();
    const model = modelInput || defaultModel;

    const savePath = getConfigFilePath();
    saveConfigFile({
      apiKey,
      baseUrl,
      model,
    });

    console.log(color.green(`\nSettings saved to: ${savePath}`));
    console.log("You can now run harness in any project directory!");
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        dir: { type: "string" },
        model: { type: "string" },
        "max-steps": { type: "string" },
        "yes-writes": { type: "boolean" },
        setup: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: false,
    });
  } catch (err: any) {
    console.error(color.red(`Error: ${err.message}`));
    console.error("Run harness --help for usage.");
    process.exit(1);
  }

  if (parsed.values.help) {
    printHelp();
    return;
  }

  if (parsed.values.setup) {
    await runSetup();
    return;
  }

  const workspaceRoot = path.resolve(parsed.values.dir || process.cwd());
  const maxSteps = parsed.values["max-steps"]
    ? parseInt(parsed.values["max-steps"], 10)
    : undefined;
  const yesWrites = Boolean(parsed.values["yes-writes"]);

  let config: HarnessConfig;
  try {
    config = loadConfig({
      model: parsed.values.model,
      maxSteps,
      yesWrites,
    });
  } catch (err: any) {
    console.error(color.red(err.message));
    process.exit(1);
  }

  let sandbox: Sandbox;
  try {
    sandbox = new Sandbox(workspaceRoot);
  } catch (err: any) {
    console.error(color.red(`Failed to initialize workspace jail: ${err.message}`));
    process.exit(1);
  }

  const tools = createDefaultRegistry({ yesWrites: config.yesWrites });
  const llm = new FetchLlmClient(config);

  console.log(
    color.dim(`Harness active in: ${sandbox.workspaceRoot} (model: ${config.model}, maxSteps: ${config.maxSteps})`)
  );
  console.log(color.dim("Type a goal to begin. Type 'exit' to quit.\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const session: Session = {
    llm,
    tools,
    sandbox,
    config,
    history: [],
    approve: async (promptText: string): Promise<boolean> => {
      console.log(`\n${promptText}`);
      const answer = (await rl.question("")).trim().toLowerCase();
      return answer === "y" || answer === "yes";
    },
    signal: new AbortController().signal,
  };

  let activeController: AbortController | null = null;

  process.on("SIGINT", () => {
    if (activeController) {
      console.log(color.yellow("\n[abort] Cancelling current step..."));
      activeController.abort();
    } else {
      console.log("\nExiting.");
      process.exit(0);
    }
  });

  while (true) {
    let goal = "";
    try {
      goal = (await rl.question(color.bold("> "))).trim();
    } catch {
      break; // EOF or readline closed
    }

    if (!goal) continue;
    if (goal === "exit" || goal === "quit") {
      console.log("Goodbye.");
      break;
    }

    activeController = new AbortController();
    session.signal = activeController.signal;

    session.onStep = ({ step, toolName, toolArgs }) => {
      let preview = "";
      if (typeof toolArgs === "object" && toolArgs !== null) {
        if ("path" in (toolArgs as any)) preview = (toolArgs as any).path;
        else if ("command" in (toolArgs as any)) preview = (toolArgs as any).command;
        else if ("query" in (toolArgs as any)) preview = `"${(toolArgs as any).query}"`;
      }
      console.log(
        `${color.cyan(`[step ${step}]`)} ${toolName}${preview ? ` ${preview}` : ""}`
      );
    };

    try {
      const result = await runAgent(session, goal);

      if (result.status === "done") {
        if (result.text) {
          console.log(`\n${result.text}`);
        }
        console.log(
          color.green(
            `\n[done] Task completed in ${result.steps} step${result.steps === 1 ? "" : "s"}, ${formatTokens(result.totalTokens)}.`
          )
        );
      } else if (result.status === "step_limit_reached") {
        console.log(
          color.yellow(
            `\n[limit] Reached maximum step cap (${result.steps} steps, ${formatTokens(result.totalTokens)}).`
          )
        );
      } else if (result.status === "aborted") {
        console.log(color.yellow("\n[aborted] Step cancelled by user."));
      } else if (result.status === "error") {
        console.log(color.red(`\n[error] ${result.error}`));
      }
    } catch (err: any) {
      console.log(color.red(`\n[unexpected error] ${err.message || String(err)}`));
    } finally {
      activeController = null;
      console.log("");
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(color.red(`Fatal error: ${err.message}`));
  process.exit(1);
});
