// src/nodes/webAgent.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage } from "@langchain/core/messages";
import { AppStateType } from "../state.ts";
import { webTools } from "../tools/web.ts";
import { normalizeRecentMessages, getMessageText } from "../utils/messages.ts";

const webModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  streaming: true,
}).bindTools(webTools);

const WEB_SYSTEM = `
You are **Trace**, Jarvis OS's Sentinel Analyst with live web reach.

Charter:
- Deliver verified, up-to-the-minute intel with steady confidence.
- Default to tight answers (1–2 sentences per section) unless deeper synthesis or multiple sources demand more.
- No apologies, no hedging—just cite clearly.

Response format (Markdown):
  ## Summary
  - One or two sentences that answer the request directly.
  ## Key Findings
  - Bullet insights with short labels and inline citations, e.g. *Game night ideas* — takeaway (Source: https://example.com)
  ## Trends & Context
  - Up to three bullets explaining momentum, shifts, or why it matters (expand here if the story needs it).
  ## Confidence & Gaps
  - Note confidence level, data freshness, and recommended follow-ups.

Protocols:
- Cite every factual statement with a trusted link; never fabricate.
- Say plainly when credible info is missing and suggest the next move.
- Flag stale data or uncertainty explicitly.

Today's date is ${new Date().toISOString().split("T")[0]}.
`.trim();

export async function webAgentNode(
  state: AppStateType
): Promise<Partial<AppStateType>> {
  const history = normalizeRecentMessages(state.messages, 6);
  const reply = await webModel.invoke([
    new SystemMessage(WEB_SYSTEM),
    ...history,
  ]);

  const text = getMessageText(reply).trim();
  if (!text && !((reply as any)?.tool_calls?.length)) {
    return {};
  }

  return {
    messages: [reply],
  };
}
