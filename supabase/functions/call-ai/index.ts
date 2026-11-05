// Live call AI via Gemini direct: caption (audio transcription), screen vision, ask, summary.
// Writes into call_transcripts (realtime-enabled).
import { admin, authUser, callGemini, consumeCredit, corsHeaders, jsonResponse, logUsage, MODELS } from "../_shared/gemini.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const start = Date.now();
  try {
    const user = await authUser(req);
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);

    const { callId, kind, audioB64, audioMime, frameB64, prompt, lang } = await req.json() as {
      callId: string;
      kind: "caption" | "screen" | "ask" | "summary";
      audioB64?: string;
      audioMime?: string;
      frameB64?: string;
      prompt?: string;
      lang?: string;
    };
    if (!callId) return jsonResponse({ error: "callId required" }, 400);

    const supa = admin();
    const { data: call } = await supa.from("calls").select("id, caller_id, receiver_id").eq("id", callId).maybeSingle();
    if (!call || (call.caller_id !== user.id && call.receiver_id !== user.id)) return jsonResponse({ error: "forbidden" }, 403);

    if (kind === "caption" && audioB64) {
      const credit = await consumeCredit(user.id, "text") as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ text: "" });
      const system = lang && lang !== "en"
        ? `Transcribe the audio and translate the result to ${lang}. Output ONLY the transcript text.`
        : "Transcribe the audio exactly. Output ONLY the transcript text.";
      const mime = audioMime?.includes("wav") ? "audio/wav" : "audio/webm";
      const res = await callGemini(MODELS.fast, [{
        role: "user",
        parts: [{ text: "Transcribe:" }, { inline_data: { mime_type: mime, data: audioB64 } }],
      }], system);
      const text = res.text;
      if (text) await supa.from("call_transcripts").insert({ call_id: callId, speaker_id: user.id, text, lang: lang ?? "en", kind: "line" });
      await logUsage({ userId: user.id, model: MODELS.fast, kind: "text", duration_ms: Date.now() - start });
      return jsonResponse({ text });
    }

    if (kind === "screen" && frameB64) {
      const credit = await consumeCredit(user.id, "image") as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ text: "" });
      const res = await callGemini(MODELS.fast, [{
        role: "user",
        parts: [{ text: prompt ?? "What is on this screen right now? One concise sentence." }, { inline_data: { mime_type: "image/jpeg", data: frameB64 } }],
      }], "Describe shared screens crisply for late-joiners.");
      if (res.text) await supa.from("call_transcripts").insert({ call_id: callId, speaker_id: user.id, text: res.text, kind: "screen" });
      await logUsage({ userId: user.id, model: MODELS.fast, kind: "image", duration_ms: Date.now() - start });
      return jsonResponse({ text: res.text });
    }

    if (kind === "ask" && frameB64) {
      const credit = await consumeCredit(user.id, "advanced") as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ text: "Daily AI credits exhausted." });
      const res = await callGemini(MODELS.advanced, [{
        role: "user",
        parts: [{ text: prompt ?? "Explain what I'm looking at." }, { inline_data: { mime_type: "image/jpeg", data: frameB64 } }],
      }], "Answer questions about the visible screen specifically and concisely.");
      await logUsage({ userId: user.id, model: MODELS.advanced, kind: "advanced", duration_ms: Date.now() - start });
      return jsonResponse({ text: res.text });
    }

    if (kind === "summary") {
      const { data: lines } = await supa.from("call_transcripts").select("text, kind").eq("call_id", callId).order("created_at");
      const transcript = (lines ?? []).map((l) => `[${l.kind}] ${l.text}`).join("\n");
      if (!transcript) return jsonResponse({ text: "" });
      const credit = await consumeCredit(user.id, "advanced") as Record<string, unknown>;
      if (!credit.allowed) return jsonResponse({ text: "Credits exhausted." });
      const res = await callGemini(MODELS.advanced, [{
        role: "user",
        parts: [{ text: transcript.slice(-12000) }],
      }], "Summarize this call transcript with sections: **TL;DR**, **Decisions**, **Action items**, **Follow-ups**. Concise.");
      if (res.text) await supa.from("call_transcripts").insert({ call_id: callId, text: res.text, kind: "summary" });
      await logUsage({ userId: user.id, model: MODELS.advanced, kind: "advanced", duration_ms: Date.now() - start });
      return jsonResponse({ text: res.text });
    }

    return jsonResponse({ error: "unsupported kind" }, 400);
  } catch (e) {
    console.error("call-ai error", e);
    return jsonResponse({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
