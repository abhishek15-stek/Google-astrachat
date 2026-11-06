// Shared Google Gemini client + credit-gating helpers for all AstraChat edge functions.
// Uses the GEMINI_API_KEY secret. No Lovable AI Gateway involved.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const MODELS = {
  fast: "gemini-2.5-flash",
  // Keep "advanced" on Flash by default: Pro quota is unreliable on free-tier keys and was breaking admin AI.
  advanced: "gemini-2.5-flash",
  fallback: "gemini-2.5-flash-lite",
  latest: "gemini-flash-latest",
  image: "gemini-2.5-flash-image",
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export type Kind = "text" | "image" | "video" | "file" | "advanced";

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  // Primary: validate JWT directly via service role client (does not depend on SUPABASE_ANON_KEY env)
  try {
    if (SUPABASE_URL && SERVICE_KEY) {
      const { data, error } = await admin().auth.getUser(token);
      if (!error && data?.user) return data.user;
    }
  } catch (e) {
    console.warn("Service role getUser fallback:", e);
  }

  // Secondary fallback: use SUPABASE_ANON_KEY if present
  try {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || SERVICE_KEY;
    if (SUPABASE_URL && anonKey) {
      const userClient = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data } = await userClient.auth.getUser();
      if (data?.user) return data.user;
    }
  } catch (e) {
    console.warn("Anon client getUser fallback:", e);
  }

  return null;
}

// Credits/limits fully disabled per product decision: single sustainable model, unlimited use for everyone.
// Kept as a stub so callers don't need refactor.
export async function consumeCredit(_userId: string, _kind: Kind) {
  return { allowed: true, admin_notice: false, admin_counter: 0 } as Record<string, unknown>;
}

export async function logUsage(opts: {
  userId: string;
  model: string;
  kind: Kind;
  tokens_in?: number;
  tokens_out?: number;
  duration_ms?: number;
  success?: boolean;
  error?: string;
}) {
  try {
    await admin().from("ai_usage_log").insert({
      user_id: opts.userId,
      model: opts.model,
      kind: opts.kind,
      tokens_in: opts.tokens_in ?? 0,
      tokens_out: opts.tokens_out ?? 0,
      duration_ms: opts.duration_ms ?? 0,
      success: opts.success ?? true,
      error: opts.error,
    });
  } catch (e) {
    console.error("logUsage failed", e);
  }
}

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiResult {
  text: string;
  images: string[]; // base64 inline images returned (gen)
  tokens_in: number;
  tokens_out: number;
  model: string;
}

// Core Gemini call. Returns text and (for image models) inline base64 images.
export async function callGemini(
  model: string,
  contents: GeminiContent[],
  systemInstruction?: string,
  opts?: { responseModalities?: string[] }
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  let activeModel = model === "gemini-2.5-pro" ? MODELS.advanced : model;
  const body: Record<string, unknown> = { contents };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  if (opts?.responseModalities) body.generationConfig = { responseModalities: opts.responseModalities };

  const request = (nextModel: string) =>
    fetch(`${GEMINI_BASE}/models/${nextModel}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let r = await request(activeModel);
  // Fallback across all supported text models on any model/quota/availability error
  if (!r.ok && !opts?.responseModalities) {
    const fallbacks = [MODELS.fast, MODELS.fallback, MODELS.latest].filter(
      (m, i, arr) => m !== activeModel && arr.indexOf(m) === i
    );
    for (const nextModel of fallbacks) {
      console.warn(`Gemini ${activeModel} failed ${r.status}, falling back to ${nextModel}`);
      activeModel = nextModel;
      r = await request(activeModel);
      if (r.ok) break;
    }
  }
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Gemini ${r.status}: ${errText}`);
  }
  const json = await r.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  const images: string[] = [];
  for (const p of parts) {
    if (typeof p.text === "string") text += p.text;
    if (p.inline_data?.data) images.push(p.inline_data.data);
    if (p.inlineData?.data) images.push(p.inlineData.data);
  }
  return {
    text: text.trim(),
    images,
    tokens_in: json?.usageMetadata?.promptTokenCount ?? 0,
    tokens_out: json?.usageMetadata?.candidatesTokenCount ?? 0,
    model: activeModel,
  };
}

// Convenience: simple chat-style call
export async function geminiChat(
  messages: { role: "user" | "assistant"; content: string }[],
  system: string,
  advanced = false
): Promise<GeminiResult> {
  const contents: GeminiContent[] = messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  return callGemini(advanced ? MODELS.advanced : MODELS.fast, contents, system);
}

// Multimodal call (image/video/file analysis)
export async function geminiMultimodal(
  prompt: string,
  mediaB64: string,
  mimeType: string,
  system?: string,
  advanced = false
): Promise<GeminiResult> {
  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: mediaB64 } },
      ],
    },
  ];
  return callGemini(advanced ? MODELS.advanced : MODELS.fast, contents, system);
}

// Image generation/editing via gemini-2.5-flash-image (Nano Banana)
export async function geminiImage(
  prompt: string,
  refImageB64?: string,
  refMime = "image/png"
): Promise<GeminiResult> {
  const parts: GeminiPart[] = [{ text: prompt }];
  if (refImageB64) parts.push({ inline_data: { mime_type: refMime, data: refImageB64 } });
  const contents: GeminiContent[] = [{ role: "user", parts }];
  return callGemini(MODELS.image, contents, undefined, { responseModalities: ["IMAGE", "TEXT"] });
}

// Helper: upload base64 image to storage and return public URL
export async function uploadGeneratedImage(userId: string, b64: string, mime = "image/png"): Promise<string> {
  const supa = admin();
  const ext = mime.split("/")[1] || "png";
  const path = `${userId}/ai-generated/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const { error } = await supa.storage.from("chat-attachments").upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  return supa.storage.from("chat-attachments").getPublicUrl(path).data.publicUrl;
}

// Helper: download a URL into base64 (for /edit on referenced images)
export async function urlToBase64(url: string): Promise<{ data: string; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
  const mime = r.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { data: btoa(bin), mime };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
