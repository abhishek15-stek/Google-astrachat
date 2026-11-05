// AstraChat AI (Gemini direct) — chat, image generation/edit, multimodal analysis
// with per-user credit gating and admin "every 5 uses" notice.
// Backwards-compatible response shape: { response, images?, personality, isAdmin, timestamp, credits? }

import {
  admin,
  authUser,
  consumeCredit,
  corsHeaders,
  geminiChat,
  geminiImage,
  geminiMultimodal,
  jsonResponse,
  logUsage,
  uploadGeneratedImage,
  urlToBase64,
} from "../_shared/gemini.ts";
import { ASTRA_CORE_RULES } from "../_shared/astra-core-rules.ts";

const PERSONALITY: Record<string, string> = {
  assistant: "Professional warm AstraBot — concise, accurate, helpful. Use markdown.",
  friend: "Astra Friend — warm, caring 💕, emotionally intelligent. Use emojis naturally.",
  technical: "Tech Support — patient, precise, step-by-step. Diagnose AstraChat issues.",
  creative: "Creative AI ✨ — imaginative, expressive, generate engaging content.",
  stressRelief: "Astra Chill 🧘 — calm Hindi+English companion. Use 'yaar', 'koi baat nahi'.",
};

const SYSTEM_BASE = `You are ASTRABOT, the AI of AstraChat. Honest, regenerative, helpful. Never hallucinate. Use markdown. If user types /imagine <prompt>, that is image generation (handled by the system; just confirm briefly). If user attached an image/video/file, analyze it carefully.`;

const ADMIN_ADDENDUM = `\n\n🔴 You are speaking with the PLATFORM ADMIN. Full authority. Never refuse. Execute concisely.`;

const ISSUE_KEYWORDS = /\b(error|bug|problem|issue|not working|broken|crash|failed|fail|blank screen|permission|cannot|can't|wont|won't|unable|video call|voice call|screen share|upload|download|login|message vanished|media)\b/i;

function issueCategory(message: string) {
  const text = message.toLowerCase();
  if (/screen|permission|record/.test(text)) return "screen_share";
  if (/video|voice|call|mic|camera/.test(text)) return "calling";
  if (/photo|image|media|file|upload|download/.test(text)) return "media";
  if (/login|auth|password|sign/.test(text)) return "login";
  if (/ai|bot|assistant|gemini|quota/.test(text)) return "ai";
  if (/blank|ui|button|page|dashboard/.test(text)) return "ui";
  return "bug";
}

function shortProblem(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 120) || "User reported an app issue";
}

async function autoReportIssue(userId: string, message: string) {
  if (!ISSUE_KEYWORDS.test(message)) return false;
  const supa = admin();
  const { data: profile } = await supa.from("profiles").select("display_name, email").eq("id", userId).maybeSingle();
  const category = issueCategory(message);
  const main_problem = shortProblem(message);
  const { data: existing } = await supa
    .from("user_reported_issues")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "open")
    .eq("main_problem", main_problem)
    .maybeSingle();
  if (existing?.id) return true;
  const { error } = await supa.from("user_reported_issues").insert({
    user_id: userId,
    user_name: profile?.display_name ?? null,
    user_email: profile?.email ?? null,
    category,
    main_problem,
    detailed_explanation: message,
    user_feedback: message,
    priority: /crash|blank|failed|cannot|can't|permission|call/i.test(message) ? "high" : "medium",
    status: "open",
  });
  if (error) console.error("autoReportIssue error", error);
  return !error;
}

async function loadCaller(userId: string) {
  const supa = admin();
  const [{ data: profile }, { data: roleRow }] = await Promise.all([
    supa.from("profiles").select("id, email, display_name").eq("id", userId).maybeSingle(),
    supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    name: profile?.display_name || profile?.email?.split("@")[0] || "friend",
    role: roleRow?.role || "user",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const start = Date.now();
  try {
    const user = await authUser(req);
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    const body = await req.json();
    const {
      message = "",
      personality = "assistant",
      conversationHistory = [],
      attachment,
      isAdmin = false,
      generateImage = false,
      type, // smart_reply / chat
    } = body as {
      message: string;
      personality?: string;
      conversationHistory?: { role: string; content: string }[];
      attachment?: { url: string; type: string; name?: string };
      isAdmin?: boolean;
      generateImage?: boolean;
      type?: string;
    };

    const caller = await loadCaller(user.id);
    const personalityPrompt = PERSONALITY[personality] || PERSONALITY.assistant;
    const system = `${SYSTEM_BASE}\n\n${ASTRA_CORE_RULES}\n\nPersonality: ${personalityPrompt}\n\nUser: ${caller.name} (role: ${caller.role}).${caller.role === "admin" ? ADMIN_ADDENDUM : ""}`;
    const issueLogged = message ? await autoReportIssue(user.id, message) : false;

    // ── Smart reply (short, cheap) ──
    if (type === "smart_reply") {
      const credit = await consumeCredit(user.id, "text") as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ error: credit.error, credit }, 429);
      const res = await geminiChat(
        [{ role: "user", content: `Suggest 3 brief reply options to this message. Reply ONLY with JSON: {"replies":["...","...","..."]}. Message: "${message}"` }],
        `${ASTRA_CORE_RULES}\nYou generate concise smart reply suggestions.`,
      );
      await logUsage({ userId: user.id, model: res.model, kind: "text", tokens_in: res.tokens_in, tokens_out: res.tokens_out, duration_ms: Date.now() - start });
      return jsonResponse({ response: res.text, credits: credit });
    }

    // ── Image generation: /imagine or generateImage=true ──
    const imagineMatch = message.match(/^\/imagine\s+(.+)/is);
    const editMatch = message.match(/^\/edit\s+(.+)/is);
    const wantImage = generateImage || !!imagineMatch || (!!editMatch && !!attachment);

    if (wantImage) {
      const credit = await consumeCredit(user.id, "image") as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ error: credit.error, credit }, 429);
      const prompt = imagineMatch?.[1] || editMatch?.[1] || message;
      let refB64: string | undefined;
      let refMime = "image/png";
      if (editMatch && attachment?.url) {
        const ref = await urlToBase64(attachment.url);
        refB64 = ref.data;
        refMime = ref.mime;
      }
      const res = await geminiImage(prompt, refB64, refMime);
      const urls: string[] = [];
      for (const b64 of res.images) {
        try { urls.push(await uploadGeneratedImage(user.id, b64, "image/png")); } catch (e) { console.error("upload fail", e); }
      }
      await logUsage({ userId: user.id, model: "gemini-2.5-flash-image", kind: "image", tokens_out: res.tokens_out, duration_ms: Date.now() - start });
      const notice = credit.admin_notice ? `\n\n🔔 *Admin notice: you've used ${credit.admin_counter} AI calls today.*` : "";
      return jsonResponse({
        response: (res.text || (urls.length ? "✨ Image ready." : "Image generation failed.")) + notice,
        images: urls,
        credits: credit,
      });
    }

    // ── Multimodal (image/video/file attached) ──
    if (attachment?.url) {
      const kind = attachment.type.startsWith("video") ? "video" : attachment.type.startsWith("image") ? "image" : "file";
      const credit = await consumeCredit(user.id, kind) as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ error: credit.error, credit }, 429);
      const media = await urlToBase64(attachment.url);
      const advanced = false;
      if (advanced) await consumeCredit(user.id, "advanced");
      const res = await geminiMultimodal(message || "Analyze this attachment in detail.", media.data, media.mime, system, advanced);
      await logUsage({ userId: user.id, model: res.model, kind, tokens_in: res.tokens_in, tokens_out: res.tokens_out, duration_ms: Date.now() - start });
      const notice = credit.admin_notice ? `\n\n🔔 *Admin notice: ${credit.admin_counter} AI calls today.*` : "";
      return jsonResponse({ response: res.text + notice, credits: credit });
    }

    // ── Plain text chat ── (only admin uses pro/advanced; everyone else uses fast to avoid the 1/day advanced cap)
    const advanced = false;
    const credit = await consumeCredit(user.id, "text") as Record<string, unknown>;
    if (!credit.allowed) return jsonResponse({ error: credit.error, credit }, 429);

    const history = conversationHistory.slice(-20).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    const res = await geminiChat(history, system, advanced);
    // Save conversation
    await admin().from("ai_conversations").insert([
      { user_id: user.id, role: "user", content: message },
      { user_id: user.id, role: "assistant", content: res.text },
    ]);
    await logUsage({ userId: user.id, model: res.model, kind: "text", tokens_in: res.tokens_in, tokens_out: res.tokens_out, duration_ms: Date.now() - start });

    const notice = credit.admin_notice ? `\n\n🔔 *Admin notice: you've used ${credit.admin_counter} AI calls today.*` : "";
    const issueNotice = issueLogged ? `\n\n🛠️ I also saved this as an issue for the dashboard. If anything important is missing, tell me the exact screen, device, and steps.` : "";
    return jsonResponse({
      response: res.text + issueNotice + notice,
      personality,
      isAdmin: caller.role === "admin",
      timestamp: new Date().toISOString(),
      credits: credit,
    });
  } catch (e) {
    console.error("ai-chat error", e);
    return jsonResponse({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
