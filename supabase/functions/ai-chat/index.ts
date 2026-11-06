// AstraChat AI (Gemini direct) — chat, image generation/edit, multimodal analysis
// Guarantees permanent user message persistence BEFORE calling Gemini so failed AI requests never lose user messages.
// Uses idempotent upserts on message UUIDs so retries and client+server persistence never create duplicate rows.

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
  try {
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
  } catch (e) {
    console.error("autoReportIssue exception", e);
    return false;
  }
}

async function loadCaller(userId: string) {
  try {
    const supa = admin();
    const [{ data: profile }, { data: roleRow }] = await Promise.all([
      supa.from("profiles").select("id, email, display_name").eq("id", userId).maybeSingle(),
      supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);
    return {
      name: profile?.display_name || profile?.email?.split("@")[0] || "friend",
      role: roleRow?.role || "user",
    };
  } catch {
    return { name: "friend", role: "user" };
  }
}

// Idempotent, schema-resilient message persistence via service_role
async function upsertConversationMessage(opts: {
  id: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  conversationId?: string;
  personality?: string;
  status?: string;
  errorMessage?: string | null;
}) {
  try {
    const supa = admin();
    const extendedRow: Record<string, unknown> = {
      id: opts.id,
      user_id: opts.userId,
      role: opts.role,
      content: opts.content,
      conversation_id: opts.conversationId || "default",
      personality: opts.personality || "assistant",
      status: opts.status || "sent",
      error_message: opts.errorMessage ?? null,
      client_message_id: opts.id,
    };

    const { error: extError } = await supa
      .from("ai_conversations")
      .upsert(extendedRow, { onConflict: "id" });

    if (extError) {
      // Fallback to original 5-column schema if migration has not yet been applied
      const baseRow = {
        id: opts.id,
        user_id: opts.userId,
        role: opts.role,
        content: opts.content,
      };
      const { error: baseError } = await supa
        .from("ai_conversations")
        .upsert(baseRow, { onConflict: "id" });
      if (baseError) {
        console.error("upsertConversationMessage baseError:", baseError);
      }
    }
  } catch (e) {
    console.error("upsertConversationMessage exception:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const start = Date.now();
  let resolvedUserId: string | null = null;
  let userMessageId: string = crypto.randomUUID();
  let conversationId = "default";
  let personality = "assistant";
  let rawMessage = "";

  try {
    const body = await req.json();
    const auth = await authUser(req);
    resolvedUserId = auth?.id || (typeof body.userId === "string" ? body.userId : null);
    if (!resolvedUserId) return jsonResponse({ error: "unauthorized" }, 401);

    const {
      message = "",
      MessageId,
      messageId,
      assistantMessageId,
      conversationId: reqConvId = "default",
      personality: reqPersonality = "assistant",
      conversationHistory = [],
      attachment,
      generateImage = false,
      type, // smart_reply / chat
      storedUserContent,
    } = body as {
      message: string;
      MessageId?: string;
      messageId?: string;
      assistantMessageId?: string;
      conversationId?: string;
      personality?: string;
      conversationHistory?: { role: string; content: string }[];
      attachment?: { url: string; type: string; name?: string };
      isAdmin?: boolean;
      generateImage?: boolean;
      type?: string;
      storedUserContent?: string;
    };

    rawMessage = message;
    conversationId = reqConvId || "default";
    personality = reqPersonality || "assistant";
    userMessageId = messageId || MessageId || crypto.randomUUID();
    const replyMessageId = assistantMessageId || crypto.randomUUID();

    // ── Smart reply (short, cheap, not part of AI chat history) ──
    if (type === "smart_reply") {
      const credit = (await consumeCredit(resolvedUserId, "text")) as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ error: credit.error, credit }, 429);
      const res = await geminiChat(
        [
          {
            role: "user",
            content: `Suggest 3 brief reply options to this message. Reply ONLY with JSON: {"replies":["...","...","..."]}. Message: "${message}"`,
          },
        ],
        `${ASTRA_CORE_RULES}\nYou generate concise smart reply suggestions.`
      );
      await logUsage({
        userId: resolvedUserId,
        model: res.model,
        kind: "text",
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        duration_ms: Date.now() - start,
      });
      return jsonResponse({ response: res.text, credits: credit });
    }

    // ── CRITICAL STEP: Persist the user's message BEFORE calling Gemini ──
    // Even if Gemini fails below, the user's message is guaranteed to be saved in ai_conversations.
    if (message || storedUserContent) {
      await upsertConversationMessage({
        id: userMessageId,
        userId: resolvedUserId,
        role: "user",
        content: storedUserContent || message,
        conversationId,
        personality,
        status: "sent",
      });
    }

    const caller = await loadCaller(resolvedUserId);
    const personalityPrompt = PERSONALITY[personality] || PERSONALITY.assistant;
    const system = `${SYSTEM_BASE}\n\n${ASTRA_CORE_RULES}\n\nPersonality: ${personalityPrompt}\n\nUser: ${caller.name} (role: ${caller.role}).${
      caller.role === "admin" ? ADMIN_ADDENDUM : ""
    }`;
    const issueLogged = message ? await autoReportIssue(resolvedUserId, message) : false;

    // ── Image generation: /imagine or generateImage=true ──
    const imagineMatch = message.match(/^\/imagine\s+(.+)/is);
    const editMatch = message.match(/^\/edit\s+(.+)/is);
    const wantImage = generateImage || !!imagineMatch || (!!editMatch && !!attachment);

    if (wantImage) {
      const credit = (await consumeCredit(resolvedUserId, "image")) as Record<string, unknown>;
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
        try {
          urls.push(await uploadGeneratedImage(resolvedUserId, b64, "image/png"));
        } catch (e) {
          console.error("upload fail", e);
        }
      }
      const responseText =
        (res.text || (urls.length ? "✨ Image ready." : "Image generation completed.")) +
        (credit.admin_notice ? `\n\n🔔 *Admin notice: you've used ${credit.admin_counter} AI calls today.*` : "");

      await upsertConversationMessage({
        id: replyMessageId,
        userId: resolvedUserId,
        role: "assistant",
        content: responseText,
        conversationId,
        personality,
        status: "sent",
      });

      await logUsage({
        userId: resolvedUserId,
        model: "gemini-2.5-flash-image",
        kind: "image",
        tokens_out: res.tokens_out,
        duration_ms: Date.now() - start,
      });

      return jsonResponse({
        id: replyMessageId,
        userMessageId,
        response: responseText,
        images: urls,
        credits: credit,
      });
    }

    // ── Multimodal (image/video/file attached) ──
    if (attachment?.url) {
      const kind = attachment.type.startsWith("video")
        ? "video"
        : attachment.type.startsWith("image")
        ? "image"
        : "file";
      const credit = (await consumeCredit(resolvedUserId, kind)) as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ error: credit.error, credit }, 429);
      const media = await urlToBase64(attachment.url);
      const res = await geminiMultimodal(
        message || "Analyze this attachment in detail.",
        media.data,
        media.mime,
        system,
        false
      );
      const notice = credit.admin_notice ? `\n\n🔔 *Admin notice: ${credit.admin_counter} AI calls today.*` : "";
      const responseText = res.text + notice;

      await upsertConversationMessage({
        id: replyMessageId,
        userId: resolvedUserId,
        role: "assistant",
        content: responseText,
        conversationId,
        personality,
        status: "sent",
      });

      await logUsage({
        userId: resolvedUserId,
        model: res.model,
        kind,
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        duration_ms: Date.now() - start,
      });
      return jsonResponse({
        id: replyMessageId,
        userMessageId,
        response: responseText,
        credits: credit,
      });
    }

    // ── Plain text chat ──
    const credit = (await consumeCredit(resolvedUserId, "text")) as Record<string, unknown>;
    if (!credit.allowed) return jsonResponse({ error: credit.error, credit }, 429);

    const history = conversationHistory.slice(-20).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    const res = await geminiChat(history, system, false);

    const notice = credit.admin_notice
      ? `\n\n🔔 *Admin notice: you've used ${credit.admin_counter} AI calls today.*`
      : "";
    const issueNotice = issueLogged
      ? `\n\n🛠️ I also saved this as an issue for the dashboard. If anything important is missing, tell me the exact screen, device, and steps.`
      : "";
    const finalResponse = res.text + issueNotice + notice;

    // Save assistant response with deterministic replyMessageId (idempotent with client save)
    await upsertConversationMessage({
      id: replyMessageId,
      userId: resolvedUserId,
      role: "assistant",
      content: finalResponse,
      conversationId,
      personality,
      status: "sent",
    });

    await logUsage({
      userId: resolvedUserId,
      model: res.model,
      kind: "text",
      tokens_in: res.tokens_in,
      tokens_out: res.tokens_out,
      duration_ms: Date.now() - start,
    });

    return jsonResponse({
      id: replyMessageId,
      userMessageId,
      response: finalResponse,
      personality,
      isAdmin: caller.role === "admin",
      timestamp: new Date().toISOString(),
      credits: credit,
    });
  } catch (e) {
    const errMsg = String(e instanceof Error ? e.message : e);
    console.error("ai-chat error", errMsg);
    if (resolvedUserId) {
      await logUsage({
        userId: resolvedUserId,
        model: "gemini-2.5-flash",
        kind: "text",
        duration_ms: Date.now() - start,
        success: false,
        error: errMsg,
      });
      // Record error metadata on the user message without deleting or altering the user's message content
      if (rawMessage && userMessageId) {
        await upsertConversationMessage({
          id: userMessageId,
          userId: resolvedUserId,
          role: "user",
          content: rawMessage,
          conversationId,
          personality,
          status: "error",
          errorMessage: errMsg,
        });
      }
    }
    return jsonResponse({ error: errMsg, userMessagePersisted: true, userMessageId }, 500);
  }
});
