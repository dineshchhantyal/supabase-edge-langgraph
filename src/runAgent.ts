// src/runAgent.ts
import { HumanMessage } from "@langchain/core/messages";
import { moeGraph } from "./graph_moe.ts";  // note the .ts here

export async function runAgent(input: string) {
  const finalState = await moeGraph.invoke({
    messages: [new HumanMessage(input)],
  });
  return finalState;
}
