// supabase/functions/langllm-chat/index.ts

// supabase/functions/chat/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// IMPORTANT: include .ts and the right relative path
import { runAgent } from "../../../src/runAgent.ts";

const encoder = new TextEncoder();

type ServeHandler = (req: Request) => Response | Promise<Response>;

const denoServe: ((handler: ServeHandler) => void) | undefined =
  (globalThis as { Deno?: { serve?: (handler: ServeHandler) => void } }).Deno
    ?.serve;

if (!denoServe) {
  throw new Error("Deno.serve is unavailable in this runtime");
}

function serializeEvent(event: string, payload: unknown): Uint8Array {
  const data = JSON.stringify(payload ?? null);
  return encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
}
denoServe(async (req: Request) => {
  if (req.method === "OPTIONS") {
    // CORS preflight
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Use POST with JSON body { message: string }" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  let body: { message?: string };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const userInput = (body.message ?? "").trim() || "Add 12 and 7 and explain";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`: connected\n\n`));
      controller.enqueue(serializeEvent("start", { input: userInput }));

      try {
        const finalState = await runAgent(userInput);
        const messages = finalState.messages ?? [];

        messages.forEach((message, index) => {
          controller.enqueue(serializeEvent("message", { index, message }));
        });

        const last = messages[messages.length - 1] ?? null;
        controller.enqueue(
          serializeEvent("summary", {
            input: userInput,
            last,
            totalMessages: messages.length,
            allMessages: messages,
          })
        );
      } catch (err) {
        console.error("langllm-chat error", err);
        controller.enqueue(
          serializeEvent("error", {
            error: "langllm agent failed",
            details: String((err as any)?.message ?? err),
          })
        );
      } finally {
        controller.enqueue(serializeEvent("done", null));
        controller.close();
      }
    },
    cancel() {
      console.log("SSE client disconnected");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
