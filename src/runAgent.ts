// src/runAgent.ts
import { HumanMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { moeGraph } from "./graph_moe.ts";  // note the .ts here

export async function runAgent(input: string) {
  const finalState = await moeGraph.invoke({
    messages: [new HumanMessage(input)],
  });
  return finalState;
}

export function streamAgentEvents(
  input: string,
  options?: Partial<RunnableConfig> & { version?: "v1" | "v2" }
) {
  const { version = "v2", ...rest } = options ?? {};
  return moeGraph.streamEvents(
    {
      messages: [new HumanMessage(input)],
    },
    {
      ...(rest as Partial<RunnableConfig>),
      version,
    }
  );
}
