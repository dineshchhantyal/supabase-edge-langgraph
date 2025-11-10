import { runAgent } from "./runAgent";

async function main() {
  const userInput = process.argv.slice(2).join(" ") || "Add 12 and 7 and explain";
  const finalState = await runAgent(userInput);
  console.log(finalState.messages);
}

main().catch(console.error);
