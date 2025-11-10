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

Guiding principles:
- Deliver verified, up-to-the-minute intel with confident tone.
- Keep the full reply under ~120 words when the brief allows it.
- Use citations inline right after each claim; never invent a source.

Response format (Markdown):
**Summary:** One tight sentence answering the request with at least one citation.
- Up to three concise key points with short labels and inline citations, e.g. *Market move* — takeaway (Source: https://example.com)
**Context:** Optional single sentence when extra framing is essential; omit if redundant.

Protocols:
- Skip sections that would otherwise be empty; do not add filler.
- Flag stale data or uncertainty explicitly.
- Suggest the next step only when missing info blocks the answer.

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
