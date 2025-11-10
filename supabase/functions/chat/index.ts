// supabase/functions/langllm-chat/index.ts

// supabase/functions/chat/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// IMPORTANT: include .ts and the right relative path
import { streamAgentEvents } from "../../../src/runAgent.ts";

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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function sanitizeValue(value: unknown, seen?: WeakSet<object>): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const tracker = seen ?? new WeakSet<object>();
    if (tracker.has(obj)) {
      return null;
    }
    tracker.add(obj);

    if (typeof (obj as { toJSON?: () => unknown }).toJSON === "function") {
      try {
        return sanitizeValue((obj as { toJSON: () => unknown }).toJSON(), tracker);
      } catch {
        // ignore custom toJSON errors
      }
    }

    if (obj instanceof Map) {
      const plain: Record<string, unknown> = {};
      for (const [key, val] of obj.entries()) {
        plain[String(key)] = sanitizeValue(val, tracker);
      }
      return plain;
    }

    if (obj instanceof Set) {
      return Array.from(obj.values()).map((item) => sanitizeValue(item, tracker));
    }

    const plain: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val === undefined || typeof val === "function" || typeof val === "symbol") {
        continue;
      }
      plain[key] = sanitizeValue(val, tracker);
    }
    return plain;
  }

  return String(value);
}

function extractChunkText(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((part) => extractChunkText(part)).join("");
  }

  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (candidate.content !== undefined) {
      return extractChunkText(candidate.content);
    }
    if (candidate.text !== undefined) {
      return extractChunkText(candidate.text);
    }
    if (candidate.message !== undefined) {
      return extractChunkText(candidate.message);
    }
    if (candidate.lc_kwargs && typeof candidate.lc_kwargs === "object") {
      const inner = candidate.lc_kwargs as Record<string, unknown>;
      if (inner.content !== undefined) {
        return extractChunkText(inner.content);
      }
      if (inner.text !== undefined) {
        return extractChunkText(inner.text);
      }
    }
  }

  return "";
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

  const abortController = new AbortController();
  if (req.signal?.aborted) {
    abortController.abort();
  } else if (req.signal) {
    req.signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    });
  }

  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        if (cancelled) {
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          cancelled = true;
          if (!abortController.signal.aborted) {
            abortController.abort();
          }
        }
      };

      const pushEvent = (event: string, payload: unknown) => {
        safeEnqueue(serializeEvent(event, payload));
      };

      safeEnqueue(encoder.encode(`: connected\n\n`));
      pushEvent("start", { input: userInput });

      if (abortController.signal.aborted) {
        cancelled = true;
        return;
      }

      const aggregated = new Map<string, { name: string; text: string }>();
      let finalState: unknown = null;
      let rootRunId: string | null = null;

      try {
        const events = streamAgentEvents(userInput, {
          signal: abortController.signal,
        });

        for await (const event of events) {
          if (cancelled) {
            break;
          }

          const { event: eventType } = event;
          if (!rootRunId) {
            rootRunId = event.run_id;
          }

          if (eventType.endsWith("_start")) {
            pushEvent("node_start", {
              runId: event.run_id,
              name: event.name,
              type: eventType,
              tags: event.tags ?? [],
              metadata: sanitizeValue(event.metadata),
            });
          }

          if (eventType.endsWith("_stream") && event.data?.chunk !== undefined) {
            const text = extractChunkText(event.data.chunk);
            if (text) {
              const current = aggregated.get(event.run_id) ?? { name: event.name, text: "" };
              current.text += text;
              current.name = event.name;
              aggregated.set(event.run_id, current);

              pushEvent("token", {
                runId: event.run_id,
                name: event.name,
                text,
                fullText: current.text,
                chunk: sanitizeValue(event.data.chunk),
              });
            }
          }

          if (eventType.endsWith("_end")) {
            if (event.run_id === rootRunId && event.data?.output !== undefined) {
              finalState = event.data.output;
            }

            const aggregate = aggregated.get(event.run_id);
            pushEvent("node_end", {
              runId: event.run_id,
              name: event.name,
              type: eventType,
              finalText: aggregate?.text ?? "",
              output: sanitizeValue(event.data?.output),
              input: sanitizeValue(event.data?.input),
            });
          }
        }
      } catch (err) {
        if (!cancelled && !isAbortError(err)) {
          console.error("langllm-chat stream error", err);
          pushEvent("error", {
            error: "langllm agent stream failed",
            details: String((err as any)?.message ?? err),
          });
        }
      } finally {
        if (!cancelled) {
          const responses = Array.from(aggregated.entries()).map(([runId, info]) => ({
            runId,
            name: info.name,
            text: info.text,
          }));

          if (finalState !== null || responses.length > 0) {
            pushEvent("summary", {
              input: userInput,
              finalState: sanitizeValue(finalState),
              responses,
            });
          }

          pushEvent("done", null);
          try {
            controller.close();
          } catch {
            // ignore close errors
          }
        }
      }
    },
    cancel() {
      cancelled = true;
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
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
