import { HumanMessage } from "@langchain/core/messages";
import { runAgent } from "./runAgent.ts";

async function main() {
  const userInput = process.argv.slice(2).join(" ") || "Add 12 and 7 and explain";
  const finalState = await runAgent({
    messages: [new HumanMessage(userInput)],
  });
  console.log(finalState.messages);
}

main().catch(console.error);
