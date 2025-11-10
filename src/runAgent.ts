// src/runAgent.ts
import { HumanMessage } from "@langchain/core/messages";
import { graph } from "./graph.ts";  // note the .ts here

export async function runAgent(input: string) {
  const finalState = await graph.invoke({
    messages: [new HumanMessage(input)],
  });
  return finalState;
}
