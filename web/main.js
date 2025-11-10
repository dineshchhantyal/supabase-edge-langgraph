const STORAGE_KEY = "langllm-playground-settings";
const DEFAULT_ENDPOINT = "https://uwxlqpnmdwtjcsiewupc.functions.supabase.co/chat";

const configForm = document.getElementById("config-form");
const endpointInput = document.getElementById("endpoint");
const apiKeyInput = document.getElementById("apiKey");
const seedInput = document.getElementById("seed");
const clearButton = document.getElementById("clear-storage");

const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const cancelButton = document.getElementById("cancel");
const chatFeed = document.getElementById("chat-feed");
const eventsFeed = document.getElementById("events");

const messageTemplate = document.getElementById("message-template");
const eventTemplate = document.getElementById("event-template");

const decoder = new TextDecoder();
let activeRun = null;

const NODE_METADATA = {
  router: {
    label: "Router",
    start: "🧭 Deciding which agents should handle the request…",
    end: "🧭 Routing plan ready.",
  },
  web_agent: {
    label: "Web Agent",
    start: "🌐 Web agent is gathering fresh sources from the live web…",
    end: "🌐 Web agent returned verified intel.",
  },
  web_tools: {
    label: "Web Tooling",
    start: "🔎 Running web search tools to collect supporting links…",
    end: "🔎 Web tools finished fetching search results.",
  },
  finance_agent: {
    label: "Finance Agent",
    start: "💹 Finance agent is interpreting the market data…",
    end: "💹 Finance agent shared the market analysis.",
  },
  core_agent: {
    label: "Core Agent",
    start: "💬 Core agent is drafting the final reply…",
    end: "💬 Core agent polished the user-facing answer.",
  },
  todo_agent: {
    label: "Task Orchestrator",
    start: "🗂️ Task orchestrator is organizing to-dos and follow-ups…",
    end: "🗂️ Task orchestration complete.",
  },
  notes_agent: {
    label: "Notes Agent",
    start: "📝 Notes agent is summarizing the conversation…",
    end: "📝 Notes agent saved the summary.",
  },
  summary: {
    label: "Summary",
    start: "",
    end: "📦 Final summary assembled.",
  },
  error: {
    label: "Error",
    start: "",
    end: "⚠️ An error was reported.",
  },
  done: {
    label: "Completed",
    start: "",
    end: "✅ Run completed.",
  },
  "bun-gemini-moe-agent": {
    label: "Orchestrator",
    start: "🤖 Orchestrator spinning up the LangGraph run…",
    end: "🤖 Orchestrator wrapping up the run.",
  },
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettings(settings) {
  endpointInput.value = settings.endpoint ?? DEFAULT_ENDPOINT;
  apiKeyInput.value = settings.apiKey ?? "";
  seedInput.value = settings.seed ?? "";
}

function initializeSettings() {
  const saved = loadSettings();
  if (saved) {
    applySettings(saved);
  } else {
    applySettings({ endpoint: DEFAULT_ENDPOINT });
  }
}

function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "";
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }
  const seconds = durationMs / 1000;
  const precision = seconds >= 10 ? 0 : 1;
  return `${seconds.toFixed(precision)} s`;
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return html;
}

function renderMarkdown(markdown) {
  const source = typeof markdown === "string" ? markdown : String(markdown ?? "");
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let currentList = null;

  const closeList = () => {
    if (!currentList) return;
    html.push(`</${currentList}>`);
    currentList = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${renderInlineMarkdown(line.slice(4).trim())}</h3>`);
      continue;
    }

    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${renderInlineMarkdown(line.slice(3).trim())}</h2>`);
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${renderInlineMarkdown(line.slice(2).trim())}</h1>`);
      continue;
    }

    if (/^(\*|-)\s+/.test(line)) {
      if (currentList !== "ul") {
        closeList();
        html.push("<ul>");
        currentList = "ul";
      }
      html.push(`<li>${renderInlineMarkdown(line.replace(/^(\*|-)\s+/, ""))}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (currentList !== "ol") {
        closeList();
        html.push("<ol>");
        currentList = "ol";
      }
      html.push(`<li>${renderInlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function abbreviate(text, max = 220) {
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function isRoutingDirectiveText(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.length) return false;
    return parsed.every((item) => typeof item === "string" && /^[a-z0-9_:-]+$/i.test(item));
  } catch {
    return false;
  }
}

function coerceText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => coerceText(entry)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.content)) return coerceText(value.content);
  }
  return "";
}

function extractPayloadSnippet(payload) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = [
    payload.finalText,
    payload.text,
    payload.details,
    payload.chunk?.kwargs?.content,
    payload.output?.kwargs?.content,
    payload.output?.content,
    payload.output?.text,
  ];
  for (const candidate of candidates) {
    const text = coerceText(candidate);
    if (text && text.trim()) {
      return abbreviate(text);
    }
  }
  return "";
}
  const TIMELINE_EVENTS = new Set(["node_start", "node_end", "summary", "error", "done"]);

  function shouldSkipTimelineEntry(eventName, rawNode) {
    if (!rawNode) return false;
    const node = rawNode.toLowerCase();
    if (node === "__start__" || node === "__end__" || node === "__pregel_pull") return true;
    if (node.startsWith("channelwrite<")) return true;
    if (node.startsWith("branch<")) return true;
    return false;
  }

  function computeTimelinePhase(eventName) {
    switch (eventName) {
      case "node_start":
        return "start";
      case "node_end":
      case "summary":
      case "done":
        return "end";
      case "error":
        return "error";
      default:
        return "info";
    }
  }

  function formatNodeLabel(rawNode) {
    if (!rawNode) return "";
    const node = rawNode.toLowerCase();
    if (node === "bun-gemini-moe-agent") return "orchestrator";
    if (node === "__pregel_pull") return "graph";
    return rawNode
      .replace(/branch:to:/gi, "branch → ")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function timelineEventLabel(eventName) {
    switch (eventName) {
      case "node_start":
        return "Started";
      case "node_end":
        return "Completed";
      case "summary":
        return "Summary";
      case "done":
        return "Run finished";
      case "error":
        return "Error";
      default:
        return eventName.replace(/_/g, " ");
    }
  }

  function timelineElapsed(tracker) {
    try {
      const delta = performance.now() - tracker.startedAt;
      return Number.isFinite(delta) ? delta : undefined;
    } catch {
      return undefined;
    }
  }

  function recordTimeline(tracker, eventName, payload) {
    if (!tracker || !payload || typeof payload !== "object") return;
    if (!TIMELINE_EVENTS.has(eventName)) return;

    const metadata = payload.metadata ?? {};
    let node = metadata.langgraph_node ?? payload.name ?? eventName;
    if (typeof node !== "string") node = String(node ?? "").trim();
    if (!node) node = eventName;

    if (shouldSkipTimelineEntry(eventName, node)) return;

    const rawStep = metadata.langgraph_step;
    const step = Number.isFinite(Number(rawStep)) ? Number(rawStep) : null;

    let snippet = extractPayloadSnippet(payload).trim();
    if (isRoutingDirectiveText(snippet)) {
      snippet = "";
    }

    const key = `${eventName}|${node}|${step ?? ""}`;
    if (!tracker.timelineByKey) {
      tracker.timelineByKey = new Map();
    }

    const elapsed = timelineElapsed(tracker);

    const existing = tracker.timelineByKey.get(key);
    if (existing) {
      if (!existing.snippet && snippet) existing.snippet = snippet;
      if (Number.isFinite(elapsed)) existing.elapsed = elapsed;
      return;
    }

    const entry = {
      key,
      event: eventName,
      eventLabel: timelineEventLabel(eventName),
      node,
      nodeLabel: formatNodeLabel(node),
      step,
      snippet,
      phase: computeTimelinePhase(eventName),
      elapsed,
    };

    tracker.timelineByKey.set(key, entry);
    tracker.timeline.push(entry);
  }
function setMessageContent(messageRef, text, options = {}) {
  const { markdown = false } = options;
  if (markdown) {
    messageRef.contentEl.innerHTML = renderMarkdown(text ?? "");
  } else {
    messageRef.contentEl.textContent = text ?? "";
  }
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function setFooterBadges(messageRef, items = []) {
  messageRef.footerEl.innerHTML = "";
  if (!items.length) {
    messageRef.footerEl.hidden = true;
    return;
  }

  messageRef.footerEl.hidden = false;
  for (const item of items) {
    const badge = document.createElement("span");
    badge.textContent = item;
    messageRef.footerEl.appendChild(badge);
  }
}

function createMessage(role) {
  const fragment = messageTemplate.content.cloneNode(true);
  const root = fragment.querySelector(".chat-message");
  root.classList.add(role === "user" ? "user" : "assistant");

  const roleEl = root.querySelector(".chat-role");
  roleEl.textContent = role === "user" ? "You" : "Assistant";

  const timeEl = root.querySelector(".chat-time");
  timeEl.textContent = formatTime(new Date());

  const contentEl = root.querySelector(".chat-content");
  contentEl.textContent = role === "assistant" ? "…" : "";

  const footerEl = root.querySelector(".chat-footer");
  const messageRef = { root, contentEl, footerEl, timeEl };
  setFooterBadges(messageRef, []);

  chatFeed.appendChild(fragment);
  chatFeed.scrollTop = chatFeed.scrollHeight;

  return messageRef;
}

function logEvent(name, payload) {
  const fragment = eventTemplate.content.cloneNode(true);
  const container = fragment.querySelector(".event-item");
  const header = fragment.querySelector(".event-header");
  const body = fragment.querySelector(".event-payload");

  header.textContent = `${formatTime(new Date())} · ${name}`;
  body.textContent = JSON.stringify(payload ?? {}, null, 2);

  eventsFeed.appendChild(fragment);
  eventsFeed.scrollTop = eventsFeed.scrollHeight;

  while (eventsFeed.children.length > 50) {
    eventsFeed.removeChild(eventsFeed.firstChild);
  }
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function createRunTracker() {
  return {
    startedAt: performance.now(),
    steps: [],
    seenSteps: new Set(),
    tokens: {
      prompt: 0,
      completion: 0,
      total: 0,
      estimated: false,
    },
    timeline: [],
    timelineByKey: new Map(),
  };
}

function recordStep(tracker, payload) {
  const metadata = payload?.metadata;
  if (!metadata) return;
  const stepIdentifier = metadata.langgraph_step;
  if (stepIdentifier === undefined || stepIdentifier === null) return;
  const key = String(stepIdentifier);
  if (tracker.seenSteps.has(key)) return;

  tracker.seenSteps.add(key);
  tracker.steps.push({
    index: Number.isFinite(Number(stepIdentifier)) ? Number(stepIdentifier) : tracker.steps.length + 1,
    node: metadata.langgraph_node ?? payload.name ?? key,
  });
}

function recordUsage(tracker, payload) {
  const usage =
    payload?.output?.kwargs?.usage_metadata ??
    payload?.output?.usage_metadata ??
    payload?.kwargs?.usage_metadata ??
    payload?.usage_metadata ??
    null;

  if (!usage) return;

  const promptTokens = toNumber(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = toNumber(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = toNumber(usage.total_tokens);

  tracker.tokens.prompt += promptTokens;
  tracker.tokens.completion += completionTokens;

  if (totalTokens > 0) {
    tracker.tokens.total += totalTokens;
  } else {
    tracker.tokens.total += promptTokens + completionTokens;
    tracker.tokens.estimated = true;
  }
}

function finalizeTracker(tracker) {
  tracker.endedAt = performance.now();
  tracker.durationMs = tracker.endedAt - tracker.startedAt;
  tracker.steps.sort((a, b) => a.index - b.index);
}

function attachRunDetails(messageRef, tracker, summaryPayload) {
  const hasSteps = tracker.steps.length > 0;
  const hasTokens = tracker.tokens.prompt || tracker.tokens.completion || tracker.tokens.total;
  const durationMs = tracker.durationMs ?? 0;

  if (!hasSteps && !hasTokens && !durationMs) return;

  let details = messageRef.root.querySelector(".run-details");
  if (!details) {
    details = document.createElement("div");
    details.className = "run-details";
    messageRef.root.appendChild(details);
  }

  const rows = [];

  if (hasSteps) {
    const trail = tracker.steps.map((step) => step.node).join(" → ");
    rows.push({ label: "Steps", value: `${tracker.steps.length}${trail ? ` · ${trail}` : ""}` });
  }

  if (hasTokens) {
    const parts = [];
    if (tracker.tokens.prompt) parts.push(`prompt ${tracker.tokens.prompt}`);
    if (tracker.tokens.completion) parts.push(`completion ${tracker.tokens.completion}`);
    if (tracker.tokens.total) {
      const prefix = tracker.tokens.estimated ? "total≈" : "total";
      parts.push(`${prefix} ${tracker.tokens.total}`);
    }
    rows.push({ label: "Tokens", value: parts.join(" · ") || "n/a" });
  }

  if (durationMs) {
    rows.push({ label: "Duration", value: formatDuration(durationMs) });
  }

  details.innerHTML = [
    '<div class="run-detail-title">Run Details</div>',
    ...rows.map((row) => `<div class="run-detail"><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.value)}</span></div>`),
  ].join("");

  if (tracker.timeline.length) {
    const timeline = document.createElement("details");
    timeline.className = "run-timeline";
    const timelineSummary = document.createElement("summary");
    timelineSummary.textContent = "View step timeline";
    timeline.appendChild(timelineSummary);

    const list = document.createElement("ol");
    list.className = "run-timeline-list";

    tracker.timeline.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = `run-timeline-item run-timeline-${entry.phase}`;

      const header = document.createElement("div");
      header.className = "run-timeline-meta";

      const stepChip = document.createElement("span");
      stepChip.className = "run-timeline-chip";
      if (entry.step !== null && entry.step !== undefined) {
        stepChip.textContent = `Step ${entry.step}`;
      } else {
        stepChip.textContent = `#${index + 1}`;
      }
      header.appendChild(stepChip);

      const nodeSpan = document.createElement("span");
      nodeSpan.className = "run-timeline-node";
      nodeSpan.textContent = entry.nodeLabel || entry.node || "";
      header.appendChild(nodeSpan);

      const eventSpan = document.createElement("span");
      eventSpan.className = "run-timeline-event";
      eventSpan.textContent = entry.eventLabel || entry.event.replace(/_/g, " ");
      header.appendChild(eventSpan);

      if (Number.isFinite(entry.elapsed)) {
        const timeSpan = document.createElement("span");
        timeSpan.className = "run-timeline-time";
        timeSpan.textContent = `+${formatDuration(entry.elapsed)}`;
        header.appendChild(timeSpan);
      }

      item.appendChild(header);

      if (entry.snippet) {
        const snippet = document.createElement("div");
        snippet.className = "run-timeline-snippet";
        snippet.textContent = entry.snippet;
        item.appendChild(snippet);
      }

      list.appendChild(item);
    });

    timeline.appendChild(list);
    details.appendChild(timeline);
  }

  if (summaryPayload?.responses && Array.isArray(summaryPayload.responses) && summaryPayload.responses.length) {
    const responsesPanel = document.createElement("details");
    responsesPanel.className = "run-responses";
    const summaryEl = document.createElement("summary");
    summaryEl.textContent = "View agent outputs";
    responsesPanel.appendChild(summaryEl);

    const list = document.createElement("div");
    list.className = "run-agent-list";

    summaryPayload.responses.forEach((response, idx) => {
      if (!response) return;
      const card = document.createElement("article");
      card.className = "run-agent-card";

      const header = document.createElement("header");
      header.className = "run-agent-card-header";
      const title = document.createElement("span");
      title.className = "run-agent-title";
      title.textContent = response.name ?? response.agent ?? `Response ${idx + 1}`;
      header.appendChild(title);

      const tokenMeta =
        response.usage_metadata ??
        response.meta?.usage_metadata ??
        response.output?.usage_metadata ??
        response.output?.kwargs?.usage_metadata ??
        null;
      if (tokenMeta) {
        const meta = document.createElement("span");
        meta.className = "run-agent-meta";
        const prompt = toNumber(tokenMeta.prompt_tokens ?? tokenMeta.input_tokens);
        const completion = toNumber(tokenMeta.completion_tokens ?? tokenMeta.output_tokens);
        const total = toNumber(tokenMeta.total_tokens);
        const parts = [];
        if (prompt) parts.push(`prompt ${prompt}`);
        if (completion) parts.push(`completion ${completion}`);
        if (total) parts.push(`total ${total}`);
        meta.textContent = parts.length ? `Tokens: ${parts.join(" · ")}` : "";
        if (meta.textContent) {
          header.appendChild(meta);
        }
      }

      card.appendChild(header);

      const body = document.createElement("div");
      body.className = "run-agent-body";
      const text = typeof response.text === "string" ? response.text.trim() : "";
      if (text) {
        body.innerHTML = renderMarkdown(text);
      } else {
        body.textContent = JSON.stringify(response, null, 2);
      }
      card.appendChild(body);

      list.appendChild(card);
    });

    responsesPanel.appendChild(list);
    details.appendChild(responsesPanel);
  }
}

function extractSummaryText(summaryPayload) {
  if (!summaryPayload?.responses || !Array.isArray(summaryPayload.responses)) return "";
  const seen = new Set();
  const parts = [];
  for (const response of summaryPayload.responses) {
    if (!response || typeof response.text !== "string") continue;
    const text = response.text.trim();
    if (!text || seen.has(text)) continue;
    if (isRoutingDirectiveText(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join("\n\n");
}

function setRunState(isRunning) {
  sendButton.disabled = isRunning;
  cancelButton.disabled = !isRunning;
  messageInput.disabled = isRunning;
}

async function* parseSSE(stream) {
  const reader = stream.getReader();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const segments = buffer.split("\n\n");
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        if (!segment || segment.startsWith(":")) continue;
        let eventName = "message";
        let dataStr = "";
        const lines = segment.split("\n");
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataStr += line.slice(5).trim();
          }
        }
        if (!dataStr) continue;
        let payload;
        try {
          payload = JSON.parse(dataStr);
        } catch {
          continue;
        }
        yield { event: eventName, payload };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function streamResponse(endpoint, key, message, seed) {
  const abortController = new AbortController();
  activeRun = { abortController };
  setRunState(true);

  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;

  const bodyMessage = seed ? `${seed}\n\n${message}` : message;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: bodyMessage }),
    signal: abortController.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`);
  }

  return { stream: response.body, abortController };
}

async function handleChatSubmit(event) {
  event.preventDefault();
  if (activeRun) return;

  const endpoint = endpointInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const seed = seedInput.value.trim();
  const message = messageInput.value.trim();

  if (!endpoint || !message) {
    return;
  }

  const userMessage = createMessage("user");
  setMessageContent(userMessage, message, { markdown: false });

  const assistantMessage = createMessage("assistant");
  setMessageContent(assistantMessage, "Thinking…", { markdown: false });
  setFooterBadges(assistantMessage, ["streaming"]);

  messageInput.value = "";
  autoResize(messageInput);

  const runTracker = createRunTracker();
  let assembledText = "";
  let summaryPayload = null;

  try {
    const { stream, abortController } = await streamResponse(endpoint, apiKey, message, seed);
    activeRun.abortController = abortController;

    for await (const { event: eventName, payload } of parseSSE(stream)) {
      logEvent(eventName, payload);
      recordTimeline(runTracker, eventName, payload);

      if (payload && typeof payload === "object") {
        if (eventName === "node_start") {
          recordStep(runTracker, payload);
        } else if (eventName === "node_end") {
          recordUsage(runTracker, payload);
        }
      }

      if (eventName === "token" && typeof payload?.text === "string") {
        assembledText += payload.text;
        if (assembledText) {
          setMessageContent(assistantMessage, assembledText, { markdown: true });
        }
      }

      if (eventName === "error") {
        const details = payload?.details ?? "Error";
        setMessageContent(assistantMessage, details, { markdown: false });
        setFooterBadges(assistantMessage, ["error"]);
      }

      if (eventName === "summary") {
        summaryPayload = payload;
        const summaryText = extractSummaryText(payload);
        if (summaryText) {
          assembledText = summaryText;
          setMessageContent(assistantMessage, assembledText, { markdown: true });
        }
      }

      if (eventName === "done") {
        break;
      }
    }

    finalizeTracker(runTracker);

    const footerBadges = ["complete"];
    if (runTracker.steps.length) {
      footerBadges.push(`Steps: ${runTracker.steps.length}`);
    }

    const tokens = runTracker.tokens;
    if (tokens.prompt || tokens.completion || tokens.total) {
      const tokenBadge = `Tokens: prompt ${tokens.prompt} · completion ${tokens.completion} · ${tokens.estimated ? "total≈" : "total"} ${tokens.total}`;
      footerBadges.push(tokenBadge);
    }

    if (Number.isFinite(runTracker.durationMs)) {
      footerBadges.push(`Duration: ${formatDuration(runTracker.durationMs)}`);
    }

    setFooterBadges(assistantMessage, footerBadges);
    attachRunDetails(assistantMessage, runTracker, summaryPayload);

    if (summaryPayload) {
      logEvent("run_summary", {
        steps: runTracker.steps,
        tokens: runTracker.tokens,
        durationMs: runTracker.durationMs,
        responses: summaryPayload.responses,
      });
    }
  } catch (error) {
    const isAbort = error.name === "AbortError";
    const errorText = isAbort ? "Cancelled" : error.message ?? String(error);
    setMessageContent(assistantMessage, errorText, { markdown: false });
    setFooterBadges(assistantMessage, [isAbort ? "cancelled" : "error"]);
    logEvent("client_error", { message: errorText });
  } finally {
    activeRun = null;
    setRunState(false);
    messageInput.focus();
  }
}

function handleCancel() {
  if (!activeRun || !activeRun.abortController) return;
  activeRun.abortController.abort();
  logEvent("cancel", { reason: "user" });
}

function handleConfigSubmit(event) {
  event.preventDefault();
  const settings = {
    endpoint: endpointInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    seed: seedInput.value.trim(),
  };
  persistSettings(settings);
  logEvent("config_saved", { endpoint: settings.endpoint, hasKey: Boolean(settings.apiKey) });
}

function handleClearStorage() {
  localStorage.removeItem(STORAGE_KEY);
  applySettings({ endpoint: DEFAULT_ENDPOINT, apiKey: "", seed: "" });
  logEvent("config_reset", {});
}

function initAutoResize() {
  messageInput.addEventListener("input", () => autoResize(messageInput));
  seedInput.addEventListener("input", () => autoResize(seedInput));
  autoResize(messageInput);
  autoResize(seedInput);
}

initializeSettings();
initAutoResize();

configForm.addEventListener("submit", handleConfigSubmit);
clearButton.addEventListener("click", handleClearStorage);
chatForm.addEventListener("submit", handleChatSubmit);
cancelButton.addEventListener("click", handleCancel);

messageInput.focus();
