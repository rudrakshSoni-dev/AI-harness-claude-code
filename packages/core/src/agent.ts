import { Session } from "./session.js";

export interface AgentResult {
  status: "done" | "step_limit_reached" | "aborted" | "error";
  text?: string;
  steps: number;
  totalTokens: number;
  error?: string;
}

export async function runAgent(session: Session, goal: string): Promise<AgentResult> {
  session.history.push({ role: "user", content: goal });

  let totalTokens = 0;
  let stepsTaken = 0;

  for (let step = 0; step < session.config.maxSteps; step++) {
    stepsTaken = step + 1;

    if (session.signal.aborted) {
      return { status: "aborted", steps: stepsTaken, totalTokens };
    }

    let resp;
    try {
      resp = await session.llm.complete(
        session.history,
        session.tools.schemas(),
        session.signal
      );
    } catch (err: any) {
      if (session.signal.aborted) {
        return { status: "aborted", steps: stepsTaken, totalTokens };
      }
      return {
        status: "error",
        error: err.message || String(err),
        steps: stepsTaken,
        totalTokens,
      };
    }

    if (resp.usage) {
      totalTokens += resp.usage.totalTokens;
    }

    session.history.push(resp.message);

    if (resp.toolCalls.length === 0) {
      return {
        status: "done",
        text: resp.text,
        steps: stepsTaken,
        totalTokens,
      };
    }

    for (const call of resp.toolCalls) {
      if (session.signal.aborted) {
        return { status: "aborted", steps: stepsTaken, totalTokens };
      }

      let parsedArgs: unknown = call.args;
      if (typeof call.args === "string") {
        try {
          parsedArgs = JSON.parse(call.args);
        } catch {
          // ignore parsing error for display
        }
      }

      session.onStep?.({
        step: stepsTaken,
        toolName: call.name,
        toolArgs: parsedArgs,
      });

      const result = await session.tools.execute(
        call,
        session.sandbox,
        session.approve,
        session.signal
      );

      session.history.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.output,
      });
    }
  }

  return {
    status: "step_limit_reached",
    steps: session.config.maxSteps,
    totalTokens,
  };
}
