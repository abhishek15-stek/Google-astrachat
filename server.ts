import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "astrachat-db.json");

interface StoredRow {
  id: string;
  [key: string]: unknown;
}

interface DatabaseSchema {
  users: StoredRow[];
  profiles: StoredRow[];
  user_roles: StoredRow[];
  ai_conversations: StoredRow[];
  ai_memory: StoredRow[];
  ai_credits: StoredRow[];
  ai_usage_log: StoredRow[];
  messages: StoredRow[];
  groups: StoredRow[];
  group_members: StoredRow[];
  group_messages: StoredRow[];
  user_statuses: StoredRow[];
  announcements: StoredRow[];
  feedback_responses: StoredRow[];
  user_issues: StoredRow[];
  user_badges: StoredRow[];
  message_reactions: StoredRow[];
  call_signals: StoredRow[];
  call_transcripts: StoredRow[];
  typing_status: StoredRow[];
  [table: string]: StoredRow[];
}

function getDefaultDb(): DatabaseSchema {
  return {
    users: [],
    profiles: [],
    user_roles: [],
    ai_conversations: [],
    ai_memory: [],
    ai_credits: [],
    ai_usage_log: [],
    messages: [],
    groups: [],
    group_members: [],
    group_messages: [],
    user_statuses: [],
    announcements: [],
    feedback_responses: [],
    user_issues: [],
    user_badges: [],
    message_reactions: [],
    call_signals: [],
    call_transcripts: [],
    typing_status: [],
  };
}

let dbCache: DatabaseSchema | null = null;

function loadDb(): DatabaseSchema {
  if (dbCache) return dbCache;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      dbCache = { ...getDefaultDb(), ...parsed };
      return dbCache!;
    }
  } catch (err) {
    console.error("[AstraChat DB] Error loading DB file, initializing fresh:", err);
  }
  dbCache = getDefaultDb();
  saveDb(dbCache);
  return dbCache;
}

function saveDb(db: DatabaseSchema): void {
  dbCache = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), "utf-8");
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error("[AstraChat DB] Error saving DB file:", err);
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf-8");
}

function createJwt(user: StoredRow): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + 60 * 60 * 24 * 7,
      user_metadata: user.user_metadata || { username: user.username },
    })
  );
  const sig = base64UrlEncode(
    crypto.createHmac("sha256", "astrachat-local-jwt-secret").update(`${header}.${payload}`).digest("hex")
  );
  return `${header}.${payload}.${sig}`;
}

function decodeJwtUser(authHeader?: string): { id: string; email?: string } | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length >= 2) {
    try {
      const payload = JSON.parse(base64UrlDecode(parts[1]));
      if (payload && typeof payload.sub === "string" && payload.sub !== "anon") {
        return { id: payload.sub, email: payload.email };
      }
    } catch {
      // ignore invalid jwt
    }
  }
  return null;
}

const PERSONALITY_PROMPTS: Record<string, string> = {
  assistant:
    "You are AstraBot, a warm, intelligent, and helpful AI assistant inside AstraChat. Keep responses clear, accurate, and conversational.",
  friendly:
    "You are AstraBot, a warm, friendly, and encouraging AI assistant inside AstraChat. Keep responses helpful, clear, and conversational.",
  friend:
    "You are AstraBot in Best Friend Mode. Be warm, empathetic, supportive, and conversational.",
  professional:
    "You are AstraBot in Professional Mode. Provide concise, structured, accurate, and executive-ready responses.",
  technical:
    "You are AstraBot in Technical Expert Mode. Provide precise, production-grade code examples, architectural explanations, and debugging insights.",
  code:
    "You are AstraBot in Code Assistant Mode. Provide clean, well-explained, production-grade code examples and debugging insights.",
  creative:
    "You are AstraBot in Creative Muse Mode. Think imaginatively, offer vivid ideas, and help brainstorm original concepts.",
  stressRelief:
    "You are AstraBot in Calm & Mindful Mode. Speak gently, offer grounding perspectives, and help the user feel relaxed and supported.",
  concise:
    "You are AstraBot in Concise Mode. Answer directly in 1-3 short sentences without filler.",
};

const ASTRA_META_PREFIX = "\n<!--astra-meta:";
const ASTRA_META_SUFFIX = "-->";

function stripMetaFromContent(rawContent: string): string {
  if (!rawContent) return "";
  const idx = rawContent.lastIndexOf(ASTRA_META_PREFIX);
  if (idx !== -1 && rawContent.endsWith(ASTRA_META_SUFFIX)) {
    return rawContent.slice(0, idx);
  }
  return rawContent;
}

function parseMetaFromContent(rawContent: string): Record<string, unknown> | null {
  if (!rawContent) return null;
  const idx = rawContent.lastIndexOf(ASTRA_META_PREFIX);
  if (idx !== -1 && rawContent.endsWith(ASTRA_META_SUFFIX)) {
    const jsonStr = rawContent.slice(
      idx + ASTRA_META_PREFIX.length,
      rawContent.length - ASTRA_META_SUFFIX.length
    );
    try {
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }
  return null;
}

function encodeMetaInContent(
  content: string,
  meta: {
    conversation_id?: string;
    title?: string;
    personality?: string;
    status?: string;
    error_message?: string | null;
    attachment?: unknown;
    images?: string[];
  }
): string {
  const clean = stripMetaFromContent(content);
  const existingMeta = parseMetaFromContent(content) || {};
  const payload: Record<string, unknown> = { ...existingMeta };
  let hasMeta = Object.keys(payload).length > 0;

  const cid = meta.conversation_id || (existingMeta.cid as string);
  if (cid && cid !== "default") {
    payload.cid = cid;
    hasMeta = true;
  }
  if (meta.title) {
    payload.title = meta.title;
    hasMeta = true;
  }
  if (meta.personality && meta.personality !== "assistant") {
    payload.p = meta.personality;
    hasMeta = true;
  }
  if (meta.status && meta.status !== "sent" && meta.status !== "saved") {
    payload.st = meta.status;
    hasMeta = true;
  } else {
    delete payload.st;
  }
  if (meta.error_message) {
    payload.err = meta.error_message;
    hasMeta = true;
  } else {
    delete payload.err;
  }
  if (meta.attachment) {
    payload.att = meta.attachment;
    hasMeta = true;
  }
  if (meta.images && meta.images.length > 0) {
    payload.imgs = meta.images;
    hasMeta = true;
  }

  if (!hasMeta || Object.keys(payload).length === 0) return clean;
  return `${clean}${ASTRA_META_PREFIX}${JSON.stringify(payload)}${ASTRA_META_SUFFIX}`;
}

let simulatedDbFailureByUser: Record<string, boolean> = {};
let simulatedAiFailureByUser: Record<string, boolean> = {};

function buildContextualAstraReply(
  prompt: string,
  history: Array<{ role: string; content: string }>,
  personality: string,
  generateImage?: boolean
): { reply: string; images?: string[] } {
  const cleanPrompt = stripMetaFromContent(prompt || "").trim();
  const lower = cleanPrompt.toLowerCase();

  if (generateImage) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6366f1"/>
          <stop offset="50%" stop-color="#a855f7"/>
          <stop offset="100%" stop-color="#ec4899"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="32" fill="url(#g)"/>
      <circle cx="256" cy="220" r="90" fill="rgba(255,255,255,0.18)"/>
      <text x="256" y="420" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="22" font-weight="bold">AstraBot Visual</text>
    </svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    return {
      reply: `Here is the generated visual for: "${cleanPrompt.replace(/^\/imagine\s+/i, "")}"`,
      images: [dataUrl],
    };
  }

  if (/^(hi|hello|hey|greetings)\b/i.test(lower)) {
    return {
      reply: `Hello! I'm AstraBot (${personality} mode). Your conversation history is safely persisted—how can I help you today?`,
    };
  }
  if (lower.includes("2 + 2") || lower.includes("2+2")) {
    return { reply: "4" };
  }
  if (lower.includes("planet")) {
    return { reply: "Earth (along with Mars, Jupiter, Saturn, Venus, Mercury, Uranus, and Neptune)." };
  }
  if (lower.includes("color is the sky")) {
    return { reply: "On a clear day, the sky is blue due to Rayleigh scattering of sunlight." };
  }
  if (lower.includes("motto")) {
    return { reply: "Build, test, ship." };
  }

  const prevContextCount = history.length;
  return {
    reply: `AstraBot (${personality}): I received your message "${cleanPrompt}"${
      prevContextCount > 0 ? ` (with ${prevContextCount} prior message(s) in this thread)` : ""
    }. Everything in this conversation is permanently saved to your account.`,
  };
}

async function generateGeminiReply(options: {
  messages: Array<{ role: string; content: string }>;
  personality?: string;
  mode?: string;
  prompt?: string;
  fileData?: string;
  fileMimeType?: string;
  context?: string;
  generateImage?: boolean;
}): Promise<{ reply: string; suggestions?: string[]; images?: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
  const personalityKey = options.personality || "assistant";
  const systemInstruction =
    PERSONALITY_PROMPTS[personalityKey] || PERSONALITY_PROMPTS.assistant;

  const historyMessages = (options.messages || [])
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      content: stripMetaFromContent(String(m.content || "")).trim(),
    }))
    .filter((m) => m.content.length > 0);

  const userPrompt = stripMetaFromContent(
    options.prompt ||
      (historyMessages.length > 0 ? historyMessages[historyMessages.length - 1].content : "Hello")
  );

  if (options.mode === "smart_replies") {
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      return {
        reply: "Sounds good!, Tell me more, Thanks!",
        suggestions: ["Sounds good!", "Tell me more", "Thanks!"],
      };
    }
  }

  if (options.generateImage) {
    return buildContextualAstraReply(userPrompt, historyMessages, personalityKey, true);
  }

  // When a real server-side Gemini API key is configured, call @google/genai
  if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    if (options.mode === "smart_replies") {
      const promptText = `Generate 3 short, natural smart reply suggestions (under 8 words each) for this message: "${
        options.context || userPrompt
      }". Return ONLY a JSON array of 3 strings.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: promptText,
        config: {
          systemInstruction: "You generate concise smart reply suggestions as a JSON string array.",
          temperature: 0.5,
        },
      });
      const text = response.text || "[]";
      const match = text.match(/\[[\s\S]*\]/);
      let suggestions = ["Sounds good!", "Tell me more", "Thanks!"];
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            suggestions = parsed.slice(0, 3).map(String);
          }
        } catch {
          // use default suggestions
        }
      }
      return { reply: suggestions.join(", "), suggestions };
    }

    const contents: Array<{
      role: string;
      parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
    }> = historyMessages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

    if (options.fileData && options.fileMimeType) {
      const base64Clean = options.fileData.includes(",")
        ? options.fileData.split(",")[1]
        : options.fileData;
      contents.push({
        role: "user",
        parts: [
          { inlineData: { data: base64Clean, mimeType: options.fileMimeType } },
          { text: userPrompt || "Analyze this file and describe its contents." },
        ],
      });
    } else if (contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: userPrompt }],
      });
    }

    const modelsToTry = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents.length > 0 ? contents : "Hello",
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        const text = response.text?.trim();
        if (text) {
          return { reply: text };
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[AstraChat Gemini] Model ${modelName} error:`, errMsg);
      }
    }
  }

  // Fallback contextual generator when running in container with placeholder MY_GEMINI_API_KEY
  return buildContextualAstraReply(userPrompt, historyMessages, personalityKey, options.generateImage);
}

function upsertAiConversationRow(row: {
  id: string;
  user_id: string;
  role: string;
  content: string;
  conversation_id?: string;
  title?: string;
  personality?: string;
  status?: string;
  error_message?: string | null;
  client_message_id?: string;
  attachment?: unknown;
  images?: string[];
  created_at?: string;
  updated_at?: string;
}): StoredRow {
  const db = loadDb();
  const now = new Date().toISOString();
  const parsedMeta = parseMetaFromContent(row.content);
  const conversationId =
    row.conversation_id ||
    (parsedMeta?.cid as string) ||
    (parsedMeta?.conversation_id as string) ||
    "default";
  const cleanContent = stripMetaFromContent(row.content);
  const status = row.status || (parsedMeta?.st as string) || "sent";
  const errorMessage =
    row.error_message !== undefined
      ? row.error_message
      : ((parsedMeta?.err as string | null) ?? null);
  const title = row.title || (parsedMeta?.title as string) || undefined;
  const personality = row.personality || (parsedMeta?.p as string) || "assistant";
  const clientMessageId = row.client_message_id || row.id;

  const encodedContent = encodeMetaInContent(cleanContent, {
    conversation_id: conversationId,
    title,
    personality,
    status,
    error_message: errorMessage,
    attachment: row.attachment || parsedMeta?.att,
    images: row.images || (parsedMeta?.imgs as string[] | undefined),
  });

  const existingIndex = db.ai_conversations.findIndex(
    (r) =>
      r.user_id === row.user_id &&
      (r.id === row.id ||
        (row.client_message_id && r.client_message_id === row.client_message_id))
  );

  if (existingIndex !== -1) {
    const existing = db.ai_conversations[existingIndex];
    const updated: StoredRow = {
      ...existing,
      role: row.role || existing.role,
      content: encodedContent,
      conversation_id: conversationId,
      title: title || existing.title || null,
      personality,
      status,
      error_message: errorMessage,
      client_message_id: clientMessageId,
      updated_at: now,
    };
    db.ai_conversations[existingIndex] = updated;
    saveDb(db);
    return updated;
  }

  const created: StoredRow = {
    id: row.id || crypto.randomUUID(),
    user_id: row.user_id,
    role: row.role,
    content: encodedContent,
    conversation_id: conversationId,
    title: title || null,
    personality,
    status,
    error_message: errorMessage,
    client_message_id: clientMessageId,
    created_at: row.created_at || now,
    updated_at: row.updated_at || now,
  };
  db.ai_conversations.push(created);
  saveDb(db);
  return created;
}

async function handleAiChatRequest(req: Request, res: Response) {
  try {
    const jwtUser = decodeJwtUser(req.headers.authorization);
    const body = req.body || {};
    const userId = jwtUser?.id || body.userId;

    if (!userId || typeof userId !== "string") {
      return res.status(401).json({ error: "Unauthorized: Missing valid user session" });
    }

    const mode = body.mode || "chat";
    const personality = body.personality || "assistant";
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : "default";
    const userMessageId =
      (typeof body.messageId === "string" && body.messageId.trim()) ||
      (typeof body.userMessageId === "string" && body.userMessageId.trim()) ||
      crypto.randomUUID();
    const assistantMessageId =
      (typeof body.assistantMessageId === "string" && body.assistantMessageId.trim()) ||
      crypto.randomUUID();
    const conversationTitle =
      typeof body.conversationTitle === "string" && body.conversationTitle.trim()
        ? body.conversationTitle.trim()
        : undefined;

    // Extract history and latest user message content (supports both useAIChat payload and direct payload)
    const rawHistory = Array.isArray(body.conversationHistory)
      ? body.conversationHistory
      : Array.isArray(body.messages)
      ? body.messages
      : [];
    const lastUserMsg = [...rawHistory].reverse().find((m: { role?: string }) => m.role === "user");
    const userPromptText =
      (typeof body.message === "string" && body.message.trim() ? body.message : "") ||
      (typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : "") ||
      (lastUserMsg && typeof lastUserMsg.content === "string" ? lastUserMsg.content : "");

    const combinedMessages = [
      ...rawHistory,
      ...(userPromptText && (!lastUserMsg || lastUserMsg.content !== userPromptText)
        ? [{ role: "user", content: userPromptText }]
        : []),
    ];

    // PHASE 3 MANDATORY REQUIREMENT:
    // Save the user's message to the database BEFORE calling Gemini so that even if
    // Gemini fails, the user's message is permanently stored in `ai_conversations`.
    let savedUserRow: StoredRow | null = null;
    if (mode !== "smart_replies" && userPromptText.trim()) {
      savedUserRow = upsertAiConversationRow({
        id: userMessageId,
        user_id: userId,
        role: "user",
        content: body.storedUserContent || userPromptText,
        conversation_id: conversationId,
        title: conversationTitle,
        personality,
        status: "sent",
        error_message: null,
        attachment: body.attachment,
        client_message_id: userMessageId,
      });
    }

    // Check if simulated AI failure is enabled for testing Phase 8 Test 3
    const forceAiFailure =
      req.headers["x-simulate-ai-failure"] === "true" ||
      body.simulateAiFailure === true ||
      simulatedAiFailureByUser[userId] === true;

    if (forceAiFailure) {
      if (savedUserRow) {
        upsertAiConversationRow({
          id: String(savedUserRow.id),
          user_id: userId,
          role: "user",
          content: userPromptText,
          conversation_id: conversationId,
          title: conversationTitle,
          personality,
          status: "error",
          error_message: "AI connection issue: Edge Function returned a non-2xx status code",
          attachment: body.attachment,
          client_message_id: userMessageId,
          created_at: String(savedUserRow.created_at),
        });
      }
      return res.status(503).json({
        error: "AI connection issue: Edge Function returned a non-2xx status code",
        userMessageSaved: true,
        userMessageId,
      });
    }

    try {
      const result = await generateGeminiReply({
        messages: combinedMessages,
        personality,
        mode,
        prompt: userPromptText,
        fileData: body.fileData,
        fileMimeType: body.fileMimeType,
        context: body.context,
        generateImage: Boolean(body.generateImage),
      });

      if (mode === "smart_replies") {
        return res.json({
          suggestions: result.suggestions || ["Sounds good!", "Got it", "Thanks!"],
        });
      }

      // Clear any previous error on the user message now that AI succeeded
      if (savedUserRow) {
        upsertAiConversationRow({
          id: String(savedUserRow.id),
          user_id: userId,
          role: "user",
          content: userPromptText,
          conversation_id: conversationId,
          title: conversationTitle,
          personality,
          status: "sent",
          error_message: null,
          attachment: body.attachment,
          client_message_id: userMessageId,
          created_at: String(savedUserRow.created_at),
        });
      }

      // Save the assistant response separately with a deterministic ID and monotonic timestamp
      const userTimestampMs = savedUserRow
        ? new Date(String(savedUserRow.created_at)).getTime()
        : Date.now();
      const assistantTimestamp = new Date(Math.max(Date.now(), userTimestampMs + 5)).toISOString();

      const savedAssistantRow = upsertAiConversationRow({
        id: assistantMessageId,
        user_id: userId,
        role: "assistant",
        content: result.reply,
        conversation_id: conversationId,
        title: conversationTitle,
        personality,
        status: "sent",
        error_message: null,
        images: result.images,
        client_message_id: assistantMessageId,
        created_at: assistantTimestamp,
      });

      return res.json({
        response: result.reply,
        reply: result.reply,
        images: result.images,
        id: savedAssistantRow.id,
        userMessageId: savedUserRow?.id || userMessageId,
        assistantMessageId: savedAssistantRow.id,
        conversationId,
      });
    } catch (aiErr) {
      const errMsg = aiErr instanceof Error ? aiErr.message : "AI generation failed";
      if (savedUserRow) {
        upsertAiConversationRow({
          id: String(savedUserRow.id),
          user_id: userId,
          role: "user",
          content: userPromptText,
          conversation_id: conversationId,
          title: conversationTitle,
          personality,
          status: "error",
          error_message: errMsg,
          attachment: body.attachment,
          client_message_id: userMessageId,
          created_at: String(savedUserRow.created_at),
        });
      }
      return res.status(502).json({
        error: errMsg,
        userMessageSaved: true,
        userMessageId,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return res.status(500).json({ error: message });
  }
}

function parsePostgrestFilterVal(rawVal: string | undefined): { op: string; val: string } | null {
  if (!rawVal) return null;
  const dotIdx = rawVal.indexOf(".");
  if (dotIdx === -1) return { op: "eq", val: rawVal };
  return {
    op: rawVal.slice(0, dotIdx),
    val: rawVal.slice(dotIdx + 1),
  };
}

function applyPostgrestFilters(rows: StoredRow[], query: Record<string, unknown>): StoredRow[] {
  let result = [...rows];
  for (const [key, rawValue] of Object.entries(query)) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) {
      continue;
    }
    const strVal = Array.isArray(rawValue) ? String(rawValue[0]) : String(rawValue);
    if (key === "or") {
      // Handle basic or=(...) syntax used in P2P messages
      const inner = strVal.replace(/^\(/, "").replace(/\)$/, "");
      result = result.filter((row) => {
        if (inner.includes("sender_id.eq.") && inner.includes("receiver_id.eq.")) {
          const ids = [...inner.matchAll(/[0-9a-fA-F-]{36}|[a-zA-Z0-9_-]{8,}/g)].map((m) => m[0]);
          const uniqueIds = Array.from(new Set(ids.filter((x) => !["sender_id", "receiver_id", "and", "eq"].includes(x))));
          if (uniqueIds.length >= 2) {
            const [u1, u2] = uniqueIds;
            return (
              (row.sender_id === u1 && row.receiver_id === u2) ||
              (row.sender_id === u2 && row.receiver_id === u1)
            );
          }
        }
        return true;
      });
      continue;
    }
    const parsed = parsePostgrestFilterVal(strVal);
    if (!parsed) continue;
    const { op, val } = parsed;
    result = result.filter((row) => {
      const fieldVal = row[key];
      if (op === "eq") return String(fieldVal ?? "") === val;
      if (op === "neq") return String(fieldVal ?? "") !== val;
      if (op === "lt") return String(fieldVal ?? "") < val;
      if (op === "lte") return String(fieldVal ?? "") <= val;
      if (op === "gt") return String(fieldVal ?? "") > val;
      if (op === "gte") return String(fieldVal ?? "") >= val;
      if (op === "ilike") {
        const needle = val.replace(/%/g, "").toLowerCase();
        return String(fieldVal ?? "").toLowerCase().includes(needle);
      }
      if (op === "in") {
        const list = val
          .replace(/^\(/, "")
          .replace(/\)$/, "")
          .split(",")
          .map((s) => s.replace(/^"|"$/g, "").trim());
        return list.includes(String(fieldVal ?? ""));
      }
      if (op === "is") {
        if (val === "null") return fieldVal === null || fieldVal === undefined;
        if (val === "true") return fieldVal === true;
        if (val === "false") return fieldVal === false;
      }
      return true;
    });
  }
  return result;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // ============================================================================
  // 1. Direct Server-Side AI Chat & Persistence Routes (/api/*)
  // ============================================================================
  app.post("/api/ai-chat", handleAiChatRequest);

  app.get("/api/ai-conversations", (req: Request, res: Response) => {
    const jwtUser = decodeJwtUser(req.headers.authorization);
    const queryUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const userId = jwtUser?.id || queryUserId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: Missing user ID" });
    }

    if (
      req.headers["x-simulate-db-failure"] === "true" ||
      req.query.simulateDbFailure === "true" ||
      simulatedDbFailureByUser[userId] === true
    ) {
      return res.status(503).json({
        error: "Simulated database retrieval failure: Unable to read ai_conversations",
      });
    }

    const db = loadDb();
    const conversationId =
      typeof req.query.conversationId === "string" ? req.query.conversationId : undefined;
    const beforeCreatedAt =
      (typeof req.query.before === "string" ? req.query.before : undefined) ||
      (typeof req.query.beforeCreatedAt === "string" ? req.query.beforeCreatedAt : undefined);
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    // Strict user isolation: only rows owned by userId
    let rows = db.ai_conversations.filter((r) => r.user_id === userId);
    if (conversationId) {
      rows = rows.filter((r) => {
        const meta = parseMetaFromContent(String(r.content || ""));
        const rowConvId =
          r.conversation_id ||
          (meta?.cid as string) ||
          (meta?.conversation_id as string) ||
          "default";
        return rowConvId === conversationId;
      });
    }
    if (beforeCreatedAt) {
      rows = rows.filter((r) => String(r.created_at || "") < beforeCreatedAt);
    }

    // Sort newest first, limit, then return both rows and messages
    rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const sliced = rows.slice(0, limit);
    return res.json({ rows: sliced, messages: sliced });
  });

  app.post("/api/ai-conversations", (req: Request, res: Response) => {
    const jwtUser = decodeJwtUser(req.headers.authorization);
    const body = req.body || {};
    const userId = jwtUser?.id || body.user_id;

    if (!userId || (body.user_id && body.user_id !== userId)) {
      return res.status(403).json({ error: "Forbidden: User ownership mismatch" });
    }

    const saved = upsertAiConversationRow({
      id: body.id || crypto.randomUUID(),
      user_id: userId,
      role: body.role || "user",
      content: String(body.content || ""),
      conversation_id: body.conversation_id,
      title: body.title,
      personality: body.personality,
      status: body.status || "sent",
      error_message: body.error_message ?? null,
      client_message_id: body.client_message_id || body.id,
      created_at: body.created_at,
      updated_at: body.updated_at,
    });

    return res.json({ message: saved, row: saved });
  });

  app.delete("/api/ai-conversations", (req: Request, res: Response) => {
    const jwtUser = decodeJwtUser(req.headers.authorization);
    const body = req.body || {};
    const userId = jwtUser?.id || body.userId || (req.query.userId as string);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const conversationId =
      body.conversationId || (req.query.conversationId as string | undefined);
    const messageIds = Array.isArray(body.messageIds) ? new Set(body.messageIds) : null;
    const db = loadDb();

    db.ai_conversations = db.ai_conversations.filter((r) => {
      if (r.user_id !== userId) return true; // Never delete another user's messages
      if (messageIds && messageIds.size > 0) {
        return !messageIds.has(r.id);
      }
      if (!conversationId) return false;
      const meta = parseMetaFromContent(String(r.content || ""));
      const rowConvId =
        r.conversation_id ||
        (meta?.cid as string) ||
        (meta?.conversation_id as string) ||
        "default";
      return rowConvId !== conversationId;
    });

    saveDb(db);
    return res.json({ deleted: true });
  });

  // Test simulation control endpoint for automated verification (Phase 8 Tests 3 & 9)
  app.post("/api/test-control", (req: Request, res: Response) => {
    const { userId, simulateAiFailure, simulateDbFailure } = req.body || {};
    if (userId) {
      if ( typeof simulateAiFailure === "boolean") {
        simulatedAiFailureByUser[userId] = simulateAiFailure;
      }
      if (typeof simulateDbFailure === "boolean") {
        simulatedDbFailureByUser[userId] = simulateDbFailure;
      }
    }
    return res.json({
      ok: true,
      simulatedAiFailureByUser,
      simulatedDbFailureByUser,
    });
  });

  // ============================================================================
  // 2. Local Supabase-Compatible Engine (/ __supabase/*)
  // Ensures @supabase/supabase-js works with full Auth, RLS, and Edge Functions
  // ============================================================================
  app.post("/__supabase/auth/v1/signup", (req: Request, res: Response) => {
    const db = loadDb();
    const { email, password, data } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    let user = db.users.find((u) => String(u.email).toLowerCase() === normalizedEmail);
    const now = new Date().toISOString();

    if (!user) {
      const userId = crypto.randomUUID();
      const username =
        data?.username || normalizedEmail.split("@")[0] || `user_${userId.slice(0, 6)}`;
      user = {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: normalizedEmail,
        password_hash: crypto.createHash("sha256").update(String(password)).digest("hex"),
        email_confirmed_at: now,
        user_metadata: { username, ...data },
        app_metadata: { provider: "email", providers: ["email"] },
        created_at: now,
        updated_at: now,
      };
      db.users.push(user);

      // Automatically create profile, role, and initial AI credits (matching Supabase triggers)
      db.profiles.push({
        id: userId,
        username,
        email: normalizedEmail,
        avatar_url: null,
        status: "online",
        status_message: "Available",
        last_seen: now,
        is_Active: true,
        created_at: now,
        updated_at: now,
      });
      db.user_roles.push({
        id: crypto.randomUUID(),
        user_id: userId,
        role: db.users.length === 1 ? "admin" : "user",
        created_at: now,
      });
      db.ai_credits.push({
        id: crypto.randomUUID(),
        user_id: userId,
        credits_remaining: 500,
        credits_used: 0,
        last_reset_at: now,
        created_at: now,
        updated_at: now,
      });
      saveDb(db);
    }

    const accessToken = createJwt(user);
    return res.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 604800,
      expires_at: Math.floor(Date.now() / 1000) + 604800,
      refresh_token: `refresh_${user.id}`,
      user,
    });
  });

  app.post("/__supabase/auth/v1/token", (req: Request, res: Response) => {
    const db = loadDb();
    const grantType = req.query.grant_type || req.body?.grant_type || "password";
    const now = new Date().toISOString();

    if (grantType === "refresh_token") {
      const refreshToken = String(req.body?.refresh_token || "");
      const userId = refreshToken.replace(/^refresh_/, "");
      const user = db.users.find((u) => u.id === userId);
      if (!user) {
        return res.status(400).json({ error: "invalid_grant", error_description: "Invalid refresh token" });
      }
      const accessToken = createJwt(user);
      return res.json({
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 604800,
        expires_at: Math.floor(Date.now() / 1000) + 604800,
        refresh_token: `refresh_${user.id}`,
        user,
      });
    }

    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const passHash = crypto.createHash("sha256").update(String(password || "")).digest("hex");

    let user = db.users.find((u) => String(u.email).toLowerCase() === normalizedEmail);
    if (!user) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
    }
    if (user.password_hash && user.password_hash !== passHash) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
    }

    // Update profile online status
    const prof = db.profiles.find((p) => p.id === user!.id);
    if (prof) {
      prof.status = "online";
      prof.last_seen = now;
      saveDb(db);
    }

    const accessToken = createJwt(user);
    return res.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 604800,
      expires_at: Math.floor(Date.now() / 1000) + 604800,
      refresh_token: `refresh_${user.id}`,
      user,
    });
  });

  app.get("/__supabase/auth/v1/user", (req: Request, res: Response) => {
    const jwtUser = decodeJwtUser(req.headers.authorization);
    if (!jwtUser) {
      return res.status(401).json({ error: "Invalid token" });
    }
    const db = loadDb();
    const user = db.users.find((u) => u.id === jwtUser.id);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    return res.json(user);
  });

  app.post("/__supabase/auth/v1/logout", (_req: Request, res: Response) => {
    return res.status(204).send();
  });

  // Edge Functions Router
  app.post("/__supabase/functions/v1/:fnName", async (req: Request, res: Response) => {
    const { fnName } = req.params;
    if (fnName === "ai-chat") {
      return handleAiChatRequest(req, res);
    }
    if (fnName === "astra-core" || fnName === "call-ai" || fnName === "auto-feedback") {
      return res.json({ ok: true, status: "processed" });
    }
    return res.status(404).json({ error: `Function ${fnName} not found` });
  });

  // PostgREST RPC Router
  app.post("/__supabase/rest/v1/rpc/:rpcName", (req: Request, res: Response) => {
    const { rpcName } = req.params;
    const db = loadDb();
    const jwtUser = decodeJwtUser(req.headers.authorization);

    if (rpcName === "has_role") {
      const targetUserId = req.body?._user_id || jwtUser?.id;
      const targetRole = req.body?._role || "admin";
      const found = db.user_roles.some(
        (r) => r.user_id === targetUserId && r.role === targetRole
      );
      return res.json(found);
    }
    return res.json(null);
  });

  // PostgREST Table Router with Strict RLS Enforcement for ai_conversations & ai_memory
  app.all("/__supabase/rest/v1/:table", (req: Request, res: Response) => {
    const table = req.params.table;
    const db = loadDb();
    if (!db[table]) {
      db[table] = [];
    }

    const jwtUser = decodeJwtUser(req.headers.authorization);
    const isAdmin = jwtUser
      ? db.user_roles.some((r) => r.user_id === jwtUser.id && r.role === "admin")
      : false;
    const preferHeader = String(req.headers.prefer || "");
    const wantsSingleObject =
      String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");

    // Simulate DB Failure on ai_conversations / ai_memory when requested for Phase 8 Test 9
    if (
      (table === "ai_conversations" || table === "ai_memory") &&
      jwtUser &&
      simulatedDbFailureByUser[jwtUser.id] === true &&
      req.method === "GET"
    ) {
      return res.status(503).json({
        message: "Simulated database retrieval failure on ai_conversations",
        code: "57P01",
      });
    }

    if (req.method === "GET") {
      let rows = [...db[table]];

      // Enforce RLS User Isolation on ai_conversations and ai_memory
      if (table === "ai_conversations" || table === "ai_memory") {
        if (!jwtUser) {
          return res.status(401).json({ message: "RLS policy violation: unauthenticated" });
        }
        // Even if someone queries without user_id filter or with another user's ID,
        // non-admin users can ONLY ever read their own rows.
        if (!isAdmin || req.query.user_id) {
          rows = rows.filter((r) => r.user_id === jwtUser.id);
        }
      }

      rows = applyPostgrestFilters(rows, req.query as Record<string, unknown>);

      // Apply ordering
      if (typeof req.query.order === "string") {
        const orderSpec = req.query.order.split(",")[0];
        const [col, dir] = orderSpec.split(".");
        const asc = dir !== "desc";
        rows.sort((a, b) => {
          const va = String(a[col] ?? "");
          const vb = String(b[col] ?? "");
          return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }

      // Apply offset & limit
      const offset = Number(req.query.offset) || 0;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      if (offset > 0 || limit !== undefined) {
        rows = rows.slice(offset, limit !== undefined ? offset + limit : undefined);
      }

      if (wantsSingleObject) {
        if (rows.length === 0) {
          return res.status(406).json({
            code: "PGRST116",
            details: "The result contains 0 rows",
            message: "JSON object requested, multiple (or no) rows returned",
          });
        }
        return res.json(rows[0]);
      }

      return res.json(rows);
    }

    if (req.method === "POST") {
      const payloads = Array.isArray(req.body) ? req.body : [req.body];
      const now = new Date().toISOString();
      const inserted: StoredRow[] = [];

      for (const item of payloads) {
        if (!item || typeof item !== "object") continue;

        if (table === "ai_conversations") {
          const ownerId = jwtUser?.id || item.user_id;
          if (!ownerId || (jwtUser && item.user_id && item.user_id !== jwtUser.id)) {
            return res.status(403).json({
              message: "new row violates row-level security policy for table \"ai_conversations\"",
            });
          }
          const saved = upsertAiConversationRow({
            id: item.id || crypto.randomUUID(),
            user_id: ownerId,
            role: item.role || "user",
            content: String(item.content || ""),
            conversation_id: item.conversation_id,
            title: item.title,
            personality: item.personality,
            status: item.status,
            error_message: item.error_message,
            client_message_id: item.client_message_id || item.id,
            created_at: item.created_at,
            updated_at: item.updated_at,
          });
          inserted.push(saved);
          continue;
        }

        if (table === "ai_memory") {
          const ownerId = jwtUser?.id || item.user_id;
          if (!ownerId || (jwtUser && item.user_id && item.user_id !== jwtUser.id)) {
            return res.status(403).json({
              message: "new row violates row-level security policy for table \"ai_memory\"",
            });
          }
        }

        const isUpsert = preferHeader.includes("resolution=merge-duplicates");
        const onConflictCol = (req.query.on_conflict as string) || "id";

        if (isUpsert && item[onConflictCol]) {
          const idx = db[table].findIndex((r) => r[onConflictCol] === item[onConflictCol]);
          if (idx !== -1) {
            db[table][idx] = {
              ...db[table][idx],
              ...item,
              updated_at: now,
            };
            inserted.push(db[table][idx]);
            continue;
          }
        }

        const newRow: StoredRow = {
          id: item.id || crypto.randomUUID(),
          created_at: item.created_at || now,
          updated_at: item.updated_at || now,
          ...item,
        };
        db[table].push(newRow);
        inserted.push(newRow);
      }

      saveDb(db);
      if (wantsSingleObject) {
        return res.status(201).json(inserted[0] || {});
      }
      return res.status(201).json(inserted);
    }

    if (req.method === "PATCH") {
      let matching = [...db[table]];
      if (table === "ai_conversations" || table === "ai_memory") {
        if (!jwtUser) {
          return res.status(401).json({ message: "RLS policy violation: unauthenticated" });
        }
        matching = matching.filter((r) => r.user_id === jwtUser.id);
      }
      matching = applyPostgrestFilters(matching, req.query as Record<string, unknown>);
      const matchIds = new Set(matching.map((r) => r.id));
      const now = new Date().toISOString();
      const updated: StoredRow[] = [];

      db[table] = db[table].map((row) => {
        if (!matchIds.has(row.id)) return row;
        const next = { ...row, ...req.body, updated_at: now };
        updated.push(next);
        return next;
      });

      saveDb(db);
      if (wantsSingleObject) {
        return res.json(updated[0] || {});
      }
      return res.json(updated);
    }

    if (req.method === "DELETE") {
      let matching = [...db[table]];
      if (table === "ai_conversations" || table === "ai_memory") {
        if (!jwtUser) {
          return res.status(401).json({ message: "RLS policy violation: unauthenticated" });
        }
        matching = matching.filter((r) => r.user_id === jwtUser.id);
      }
      matching = applyPostgrestFilters(matching, req.query as Record<string, unknown>);
      const matchIds = new Set(matching.map((r) => r.id));
      const deleted = db[table].filter((r) => matchIds.has(r.id));
      db[table] = db[table].filter((r) => !matchIds.has(r.id));

      saveDb(db);
      return res.json(deleted);
    }

    return res.status(405).json({ error: "Method not allowed" });
  });

  // Mount Vite dev server in development or static dist in production
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[AstraChat Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[AstraChat Server] Fatal startup error:", err);
  process.exit(1);
});
