# SYSTEM-DESIGN.md

Single source of truth for what the harness is, how it behaves, and how it is built. Merges the former `ARCHITECTURE.md` (structure) and `DESIGN.md` (product and UX). The landing page has its own spec in `apps/web/DESIGN.md`; contributor rules live in `AGENTS.md`.

---

## 1. Overview

A small, honest AI coding harness: **bring your own API key, point it at a directory, tell it what to build.**

It is a local Node.js CLI. The user installs it, supplies their own API key, and the harness runs an agent loop that reads and edits files **inside the directory the user chose**. There is no backend, no account system, and no telemetry. The only "frontend" is a static page that explains how to install it.

## 2. Principles

1. **Local first.** Your code and your key never touch our servers, because we don't have any.
2. **Boring and legible.** One agent loop, five tools. A reader should understand the whole system in an afternoon.
3. **Safe by default.** Destructive actions need approval. The harness is jailed to the directory you chose.
4. **Small surface area.** Fewer features, each one solid, beats a long list of half-working ones.
5. **Honest limits.** The README says what the harness cannot protect you from.

## 3. Users and scope

**Target user:** a developer comfortable with a terminal and git who already has an LLM API key and wants an agent that edits their project without a subscription or an account.

**Not the target:** non-technical users, teams needing audit or compliance, anyone wanting a hosted product.

**Non-goals for v0:**
- Multi-provider routing, plugin systems, MCP support
- Persistent memory across sessions
- A hosted service or user accounts
- A GUI
- Container-grade sandboxing

## 4. Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 22 LTS or newer |
| Language | TypeScript, `strict` mode, ESM only |
| Package manager | pnpm workspaces |
| HTTP | built-in `fetch` (no SDK, no axios) |
| Validation | `zod` (tool arguments, config, LLM responses) |
| CLI args | `node:util` `parseArgs` |
| Prompts | `node:readline/promises` |
| Diffs | `diff` package |
| Tests | `vitest` |
| Lint/format | ESLint + Prettier |

Keep the dependency list this short. Every dependency is attack surface, and this tool handles API keys and runs commands.

## 5. Monorepo layout

```
harness/
├── apps/
│   ├── cli/              # `harness` executable (entry point, arg parsing, REPL, prompts)
│   └── web/              # static install guide (HTML/CSS, no framework, no build)
├── packages/
│   ├── core/             # agent loop, message history, stop conditions
│   ├── llm/              # provider client (fetch, JSON, response validation)
│   ├── tools/            # read_file, write_file, list_dir, search, run_cmd
│   ├── sandbox/          # workspace path jail + command policy
│   └── config/           # API key + settings loading
├── docs/
├── package.json          # root, private, workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── SYSTEM-DESIGN.md
├── AGENTS.md
└── apps/web/DESIGN.md
```

Each package is `@harness/<name>` with its own `package.json`, `tsconfig.json`, `src/`, and `test/`. TypeScript project references make `pnpm build` compile in dependency order.

## 6. Components and dependency rules

```
 user terminal
      │
      ▼
 apps/cli ──► @harness/config   (load API key, workspace path)
      │
      ▼
 @harness/core  (agent loop)
      │   ▲
      │   └──────── tool results
      ▼
 @harness/llm ──HTTPS──► LLM provider API
      │
      ▼ (tool calls requested by model)
 @harness/tools ──► @harness/sandbox ──► user's workspace directory
```

Arrows only point downward:
- `tools` never imports `core` or `llm`.
- `llm` never imports `tools`.
- `sandbox` depends on nothing but Node built-ins.
- Only `core` knows about both `llm` and `tools`.

Enforce with an ESLint `no-restricted-imports` rule per package.

## 7. User flow

```
1. Clone repo
2. pnpm install && pnpm build
3. Link the CLI globally
4. Set API key (env var or first-run prompt)
5. Point it at a project directory
6. Type a goal: "add input validation to signup.ts"
7. Watch steps stream: tool calls, file reads, diffs
8. Approve writes / commands when prompted
9. Agent reports done
```

Target: **zero to first edit in under 5 minutes.**

### Data flow for one request

1. User runs `harness --dir ./my-project` and types a goal.
2. CLI loads config and builds a `Session` (llm client, tool registry, sandbox rooted at `./my-project`).
3. Core appends the goal to history and calls the LLM with tool schemas.
4. Model replies with text and/or tool calls.
5. Each tool call is validated, sandboxed, optionally approved, executed. Results go back into history.
6. Loop until done or step limit. Final text is printed.

## 8. CLI behavior

```
harness [--dir <path>] [--model <name>] [--max-steps N] [--yes-writes]

Interactive:
  > add logging to the parser
  [step 1] list_dir .
  [step 2] read_file src/parser.ts
  [step 3] write_file src/parser.ts        (diff shown)
           Apply this change? [y/N]
  [done]  Added logging at parse entry and error paths. 3 steps, ~4.1k tokens.
```

- Every tool call is printed as it happens, one line each.
- `write_file` shows a unified diff before asking for approval (unless `--yes-writes`).
- `run_cmd` always shows the exact command and always asks. No flag disables this in v0.
- Ctrl-C aborts the current step cleanly (via `AbortSignal`) and returns to the prompt.
- Footer after each task: step count and approximate tokens used.
- Colors only when stdout is a TTY and `NO_COLOR` is unset.
- Errors are plain sentences with a next action: `API key not set. Export HARNESS_API_KEY or run harness --setup.`

## 9. The agent loop

This is the whole product. Everything else supports it.

```ts
// packages/core/src/agent.ts
export async function runAgent(session: Session, goal: string): Promise<AgentResult> {
  session.history.push({ role: "user", content: goal });

  for (let step = 0; step < session.config.maxSteps; step++) {
    const resp = await session.llm.complete(session.history, session.tools.schemas());
    session.history.push(resp.message);

    if (resp.toolCalls.length === 0) {
      return { status: "done", text: resp.text };      // model is finished
    }

    for (const call of resp.toolCalls) {
      const result = await session.tools.execute(call, session.sandbox, session.approve);
      session.history.push({ role: "tool", toolCallId: call.id, content: result.output });
    }
  }
  return { status: "step_limit_reached" };
}
```

- **Termination:** the model returns no tool calls, or `maxSteps` is hit. Default `maxSteps = 25`. Without this cap a confused model burns the user's money indefinitely.
- **Cancellation:** the loop takes an `AbortSignal`, passed to `fetch` and to child processes.

## 10. Tools

```ts
// packages/tools/src/tool.ts
import { z } from "zod";

export interface ToolResult { ok: boolean; output: string }

export interface Tool<A extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  args: A;                                   // zod schema, converted to JSON Schema for the model
  needsApproval: boolean;
  run(args: z.infer<A>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  sandbox: Sandbox;
  approve: (prompt: string) => Promise<boolean>;
  signal: AbortSignal;
}
```

The registry validates model-supplied arguments with `args.safeParse` before running anything. Invalid arguments return `{ ok: false, output: "<validation error>" }` to the model so it can retry. Never trust model output.

| Tool | Behavior | Needs approval |
|---|---|---|
| `list_dir` | list entries under a path | no |
| `read_file` | return file contents (size-capped) | no |
| `search` | substring/regex search in workspace | no |
| `write_file` | create or overwrite a file, shows diff first | configurable |
| `run_cmd` | run a shell command in workspace | **yes, always** |

Do not add more tools until these are solid.

## 11. Sandbox

Every path a tool touches goes through `sandbox.resolve(p)`:

1. `path.resolve(workspaceRoot, p)`.
2. `fs.realpath` the result (for files that don't exist yet, realpath the nearest existing parent and re-append the rest) so `..` and symlinks resolve.
3. `path.relative(workspaceRoot, resolved)`; reject if it starts with `..` or is absolute.
4. Compare case-insensitively on Windows and macOS default filesystems.

`run_cmd` is the dangerous one. A path jail does **not** contain a shell command. v0 policy: print the exact command, require explicit `y/N`, run via `child_process.spawn` with `cwd` set to the workspace, enforce a timeout (default 60s) and an output-size cap, and kill the process tree on abort. Real isolation (containers, seccomp) is out of scope for v0, and the README must say so.

## 12. Configuration and the API key

Resolution order:

1. `HARNESS_API_KEY` environment variable
2. `~/.config/harness/config.json` (Windows: `%APPDATA%\harness\config.json`)
3. Interactive prompt on first run, then offer to save to the config file

Rules:
- The config file is written with mode `0o600`. On Windows, POSIX modes are not enforced; say so in the docs.
- The key is sent **only** to the configured provider endpoint, in a request header.
- The key is never logged, never written into the workspace, never included in the model's context, never present in error messages. Wrap it in a small `Secret` class whose `toString()` and `toJSON()` return `"[redacted]"`.
- No telemetry. No phone-home.

## 13. Safety model

| Risk | Response |
|---|---|
| Agent edits outside project | Path jail via sandbox, symlinks resolved with `realpath` |
| Agent runs a harmful command | Mandatory per-command approval, timeout, output cap |
| Key leakage | Env var / `0o600` config file; redacting `Secret` wrapper; never logged or put in model context |
| Runaway cost | `maxSteps` cap, visible token estimate |
| Malformed or hostile model output | Every tool call validated with `zod` before execution |
| Prompt injection via file contents | Approval gates on write/exec; documented as an open risk |
| Malicious npm dependency | Minimal deps, pinned versions, committed lockfile |
| Context growth | v0 truncates old tool outputs; summarization comes later |

The README must state plainly: this is **not** a container-grade sandbox. Run it on projects under version control and review diffs. Do not remove the approval gates on `run_cmd` and `write_file` for convenience.

## 14. Distribution

- **v0:** clone, `pnpm install`, `pnpm build`, `pnpm --filter @harness/cli link --global`.
- **Later:** publish `@harness/cli` to npm so `npx` and `npm i -g` work. Do not publish until the safety story in the README is accurate.
- The CLI entry file starts with `#!/usr/bin/env node` and is declared under `bin` in its `package.json`.
- The landing page (`apps/web`) is static and deploys to any static host. It is not part of the Node build.

## 15. Testing strategy

- **Unit:** sandbox path resolution (traversal, symlinks, absolute paths, Windows separators); each tool in isolation against a temp directory.
- **Loop:** a `FakeLlm` that returns scripted tool calls, so the agent loop is tested with zero network and zero cost.
- **Validation:** malformed model output (bad JSON, unknown tool, wrong arg types) must produce an error result, never a crash.
- **Smoke:** one end-to-end run against a real provider, manual, not in CI.

## 16. Deferred decisions

- Which provider(s) beyond the first one
- Session persistence / resume
- Plugin or tool-extension API
- Streaming token output (v0 can print after each full response)
- Publishing to npm

## 17. Success criteria for v0

- A new user completes install and a first successful edit using only the web guide.
- Sandbox tests prove no path escapes the workspace, including via symlinks.
- The agent loop is fully covered by `FakeLlm` tests.
- Total source stays small enough to read in one sitting.