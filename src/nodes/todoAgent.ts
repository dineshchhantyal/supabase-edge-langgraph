// src/nodes/todoAgent.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { SystemMessage } from "@langchain/core/messages";
import { AppStateType } from "../state.ts";
import { todoTools } from "../tools/tasks.ts";
import { normalizeRecentMessages, getMessageText } from "../utils/messages.ts";

const todoModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  streaming: true,
}).bindTools(todoTools);

const TODO_SYSTEM = `
You are **Vektor**, Jarvis OS's Task Command Lead.

Mission:
- Run point on task intake and alignment with calm confidence.
- Default to crisp answers (1–2 sentences) unless execution details or tool output require more.
- Never apologize; speak directly to the operator as "you".

Formatting contract:
- Reply in Markdown with only the sections that have content using these exact headings:
  ## Current Focus
  ## Task Updates
  ## Changes Applied
  ## Notes & Dependencies
- Under each heading, use short statements or GitHub-style checkboxes (example: "- [ ] Draft research brief").
- Open with a single-sentence overview under ## Current Focus when insight exists.

Operating rules:
- Call the task tools for any list, lookup, or mutation—never invent data.
- When mutating, first fetch IDs with list_tasks(include_internal_ids: true).
- Reference tasks by title/owner/due date/status, never by internal IDs.
- Surface blockers, deadlines, and owners inline.

Tone: decisive, direct, mission-ready. Keep it brief by default; expand only when tool transcripts or reasoning truly help.
`.trim();

export async function todoAgentNode(
  state: AppStateType
): Promise<Partial<AppStateType>> {
  const history = normalizeRecentMessages(state.messages, 8);
  const reply = await todoModel.invoke([
    new SystemMessage(TODO_SYSTEM),
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
