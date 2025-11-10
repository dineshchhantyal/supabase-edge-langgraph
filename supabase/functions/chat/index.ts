// supabase/functions/langllm-chat/index.ts

// supabase/functions/chat/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// IMPORTANT: include .ts and the right relative path
import { runAgent } from "../../../src/runAgent.ts";


Deno.serve(async (req) => {
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
          "Access-Control-Allow-Origin": "*"
        }
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
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  const userInput = (body.message ?? "").trim() || "Add 12 and 7 and explain";

  try {
    const finalState = await runAgent(userInput);
    const messages = finalState.messages ?? [];
    const last = messages[messages.length - 1];

    return new Response(
      JSON.stringify({
        input: userInput,
        last,
        allMessages: messages
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  } catch (err) {
    console.error("langllm-chat error", err);
    return new Response(
      JSON.stringify({
        error: "langllm agent failed",
        details: String((err as any)?.message ?? err)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
});
