# AGENTS.md

Instructions for AI coding agents (and humans) working **on this repository**. Read `SYSTEM-DESIGN.md` first, then `apps/web/DESIGN.md`.

## Project summary

A minimal AI coding harness in Node.js 22 / TypeScript. Monorepo. The user supplies an API key; the harness runs an agent loop that edits files in a directory they choose. Frontend is a static install guide only.

## Setup

```bash
git clone https://github.com/rudrakshSoni-dev/AI-harness-claude-code.git harness && cd harness
pnpm install
pnpm build
pnpm test
```

Run locally:

```bash
export HARNESS_API_KEY=...        # never commit this
node apps/cli/dist/index.js --dir ./some-test-project
```

## Repository map

| Path | Owns |
|---|---|
| `apps/cli` | entry point, arg parsing, REPL, approval prompts |
| `apps/web` | static install guide |
| `packages/core` | agent loop, history, stop conditions |
| `packages/llm` | provider HTTP client |
| `packages/tools` | tool implementations |
| `packages/sandbox` | path jail, command policy |
| `packages/config` | API key and settings loading |

## Dependency rules (enforced in review)

- `tools` must not include anything from `core` or `llm`.
- `llm` must not include anything from `tools`.
- `sandbox` depends on nothing but Node.js built-ins.
- Only `core` wires `llm` and `tools` together.
- If you need to break one of these, stop and ask. Do not "just this once."

## Code style

- TypeScript, `strict` mode, ESM only (`NodeNext`).
- No exceptions across package boundaries; return `Result`/`ToolResult` types.
- Clean resource management everywhere: handle `AbortSignal` for child processes and fetch calls.
- `camelCase` for functions and variables, `PascalCase` for types, uppercase or `kConstant` for constants.
- Warnings/types are errors: strict compilation without any `any` types where possible.

## Testing rules

- Every new tool gets unit tests, including failure cases.
- Anything touching paths gets traversal tests: `../`, absolute paths, symlinks out of the workspace.
- Agent loop changes are tested with `FakeLlm`. Do not add tests that hit the network.
- A change is not done until `pnpm test` passes locally.

## Hard rules (do not violate)

1. **Never** log, print, persist, or transmit the API key anywhere except in the provider request header.
2. **Never** let a tool access a path without going through `Sandbox::resolve`.
3. **Never** run a shell command without user approval in v0. Do not add an auto-approve default.
4. **Never** add telemetry or network calls other than the configured LLM endpoint.
5. **Never** commit secrets, `.env` files, or real API responses containing user data.
6. Do not add dependencies without justifying them in the PR description. Every dependency is attack surface and build pain.

## Workflow for changes

1. Read the relevant package and its tests before editing.
2. Make the smallest change that solves the problem. No drive-by refactors.
3. Add or update tests.
4. Build with strict types and run `pnpm test`.
5. Update `SYSTEM-DESIGN.md` if you changed structure, tools, or data flow.
6. Commit messages: imperative mood, one line summary, body explains *why*.

## Scope discipline

v0 non-goals are listed in `SYSTEM-DESIGN.md` §3. If a task pulls you toward multi-provider routing, plugins, memory, or a GUI, flag it and stop. Feature creep kills a project this small.

## When uncertain

- Ambiguous requirement: ask, don't guess.
- Test fails for unclear reasons: report it with the failing output; don't weaken the test.
- Security-relevant decision (sandbox, approvals, key handling): take the stricter option and note it in the PR.