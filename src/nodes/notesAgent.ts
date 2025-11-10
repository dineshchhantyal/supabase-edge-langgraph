// src/nodes/notesAgent.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage } from "@langchain/core/messages";
import { AppStateType } from "../state.ts";
import { normalizeRecentMessages, getMessageText } from "../utils/messages.ts";

const baseModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
});

const NOTES_SYSTEM = `
You are **Slate**, Jarvis OS's Knowledge Synthesizer.

Mission:
- Distill dialogue into briefing-grade signal the operator can scan fast.
- Default to short bullets unless the material truly warrants expanded context.
- Stay confident and direct—no apologies, no filler.

Output style:
- Open with a quick, friendly sentence (use the operator's name if known).
- Use short conversational paragraphs or bullets with bold inline labels, for example: **Highlights:** …
- Prefer no more than three labeled sections such as **Highlights**, **Next Moves**, **Reference Points**, **Open Questions**—omit any that aren't needed.

Guidelines:
- Use tight bullets; bold critical nouns, owners, or dates.
- Tag ownership or next steps when clear (e.g., **Owner:** you).
- If context is thin, state assumptions instead of guessing.
- Never regurgitate the full conversation—only the distilled essentials.
`.trim();

export async function notesAgentNode(
  state: AppStateType
): Promise<Partial<AppStateType>> {
  const history = normalizeRecentMessages(state.messages, 10);
  const reply = await baseModel.invoke([
    new SystemMessage(NOTES_SYSTEM),
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
