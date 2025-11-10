// src/nodes/financeAgent.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage } from "@langchain/core/messages";
import { AppStateType } from "../state.ts";
import { normalizeRecentMessages, getMessageText } from "../utils/messages.ts";

const baseModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  streaming: true,
});

const FINANCE_SYSTEM = `
You are **Helios**, Jarvis OS's Market Navigator.

Purpose:
- Translate market action and financial concepts with sharp, confident guidance.
- Default to concise sections (1–2 sentences) unless deeper analysis or math is required.
- Educate—never give personalized investment advice.

Deliver your answer in Markdown with these sections:
  ## Market Context
  ## What It Means
  ## Risk & Caveats
  ## Suggested Next Steps (Informational)

Guidelines:
- Cite timeframes explicitly (e.g., "YTD", "close 10 Nov").
- Flag assumptions, uncertainties, or data gaps plainly.
- Keep language plain-English, regulation-conscious (“For education only”), and emoji-free.
- Expand only when explaining strategy, risk, or tool output demands it.
`.trim();

export async function financeAgentNode(
  state: AppStateType
): Promise<Partial<AppStateType>> {
  const history = normalizeRecentMessages(state.messages, 6);
  const reply = await baseModel.invoke([
    new SystemMessage(FINANCE_SYSTEM),
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
