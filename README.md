# AI Coding Harness

> Bring your own API key. Point it at a directory. Let it code.

A minimal, honest, local AI coding harness. Your code and your API key stay on your machine.

---

## What is this?

A local CLI that runs an agent loop to edit files inside a directory you specify.
- **Local first:** No backend, no accounts, no telemetry.
- **Honest & transparent:** Shows unified diffs before writing and requires explicit approval for shell commands.
- **Path-jailed:** Tools cannot read or write outside your chosen directory.

## Quickstart

### Prerequisites
- Node.js 22 LTS or newer
- pnpm 9+ (`corepack enable` or `npm install -g pnpm`)

### Install and build

```bash
git clone https://github.com/rudrakshSoni-dev/AI-harness-claude-code.git harness && cd harness
pnpm install
pnpm build
pnpm test
```

### Run

Set your API key:
```bash
export HARNESS_API_KEY="sk-..."
```

Run against a target directory:
```bash
node apps/cli/dist/index.js --dir ./my-project
```

Or install the CLI globally:
```bash
pnpm --filter @harness/cli link --global
harness --dir ./my-project
```

## Security & Safety Model

| Risk | Harness Protection |
|---|---|
| **Editing outside project** | Sandboxed path jail (`realpath` resolution, symlinks out of workspace blocked). |
| **Harmful shell commands** | Mandatory approval prompt (`[y/N]`) before any `run_cmd` execution. |
| **API key exposure** | Key is only sent in the Authorization header to the LLM endpoint; never logged, redacted in state. |
| **Runaway token cost** | Hard step cap (`maxSteps = 25` by default) with step & token usage summary. |

> **Notice:** This is an application-level path jail, **not a container-grade sandbox**. Shell commands execute directly on your machine once approved. Always run on projects tracked by version control (e.g. `git`) and review diffs carefully.

## Architecture

- `apps/cli`: CLI interface, REPL, and approval prompts.
- `apps/web`: Zero-dependency static install guide.
- `packages/core`: Orchestrates the agent loop (`runAgent`), step cap, and history.
- `packages/llm`: HTTP provider client with tool calling and response validation.
- `packages/tools`: The five tools (`list_dir`, `read_file`, `search`, `write_file`, `run_cmd`).
- `packages/sandbox`: Path jail and workspace resolution.
- `packages/config`: API key and settings loader with secret redaction.

## License

MIT
