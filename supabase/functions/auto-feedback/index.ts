import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiChat } from "../_shared/gemini.ts";
import { ASTRA_CORE_RULES } from "../_shared/astra-core-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const feedbackQuestionTemplates = [
  {
    question: "How would you rate your overall experience with AstraChat today?",
    questionType: "star_rating",
    options: null,
    context: "general",
  },
  {
    question: "How helpful was the AI assistant for your needs?",
    questionType: "star_rating",
    options: null,
    context: "ai_usage",
  },
  {
    question: "What best describes your experience chatting with our AI?",
    questionType: "options",
    options: ["Very Helpful 🌟", "Good 👍", "Okay 😊", "Needs Improvement 🔧"],
    context: "ai_quality",
  },
  {
    question: "How easy was it to use AstraChat features?",
    questionType: "options",
    options: ["Super Easy! 🚀", "Pretty Easy 👌", "It's Okay 🤔", "A bit tricky 😅"],
    context: "usability",
  },
  {
    question: "Would you recommend AstraChat to your friends?",
    questionType: "options",
    options: ["Definitely! 💯", "Probably Yes 👍", "Maybe 🤔", "Not Sure 😕"],
    context: "nps",
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, forceGenerate = false } = await req.json();

    const { data: settingsRows } = await supabase.from('feedback_settings').select('setting_key, setting_value');
    const setting = new Map((settingsRows || []).map((s: any) => [s.setting_key, s.setting_value]));
    const enabled = String(setting.get('enabled') ?? 'true').replace(/"/g, '') === 'true';
    const intervalHours = Math.max(1, parseInt(String(setting.get('feedback_interval_hours') ?? '24').replace(/"/g, ''), 10) || 24);
    const questionsPerSession = Math.min(5, Math.max(1, parseInt(String(setting.get('questions_per_session') ?? '1').replace(/"/g, ''), 10) || 1));

    if (!enabled && !forceGenerate) {
      return new Response(
        JSON.stringify({ sent: false, reason: "Automated feedback is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userId) {
      const { data: users } = await supabase.from('profiles').select('id').eq('is_banned', false);
      let sent = 0;
      for (const profile of users || []) {
        const result = await createFeedbackForUser(supabase, profile.id, forceGenerate, intervalHours, questionsPerSession);
        if (result.sent) sent += result.count || 1;
      }
      return new Response(JSON.stringify({ sent: sent > 0, count: sent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await createFeedbackForUser(supabase, userId, forceGenerate, intervalHours, questionsPerSession);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-feedback error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createFeedbackForUser(supabase: any, userId: string, forceGenerate: boolean, intervalHours: number, questionsPerSession: number) {
  if (!forceGenerate) {
    const { data: recentFeedback } = await supabase
      .from('feedback_requests')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastTime = recentFeedback?.[0]?.created_at;
    if (lastTime) {
      const hoursSince = (Date.now() - new Date(lastTime).getTime()) / (1000 * 60 * 60);
      if (hoursSince < intervalHours) return { sent: false, reason: `Last feedback ${hoursSince.toFixed(1)}h ago` };
    }
  }

  const templates = await buildAiFeedbackTemplates(supabase, userId, questionsPerSession);
  const rows = templates.map((selected) => ({
    user_id: userId,
    question: selected.question,
    question_type: selected.questionType,
    options: selected.options,
    context: `ai_auto_${selected.context}`,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));
  const { data: requests, error } = await supabase.from('feedback_requests').insert(rows).select();
  if (error) throw error;
  return { sent: true, count: requests?.length || rows.length, requests };
}

async function buildAiFeedbackTemplates(supabase: any, userId: string, count: number) {
  try {
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(8);
    const context = (recentMessages || []).map((m: any) => m.content).join('\n').slice(0, 1500) || 'No recent messages.';
    const res = await geminiChat([
      { role: 'user', content: `Create ${count} feedback question(s) for this AstraChat user context. Reply ONLY JSON array: [{"question":"...","questionType":"star_rating|options|mixed","options":["..."]|null,"context":"..."}]\nContext:\n${context}` }
    ], `${ASTRA_CORE_RULES}\nYou are an AI feedback planner. Ask short useful questions about app quality, problems, calls, media, chat, or AI.`);
    const parsed = JSON.parse(res.text.replace(/^```json|```$/g, '').trim());
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.slice(0, count).map((q: any) => ({
        question: String(q.question || 'How was your AstraChat experience today?').slice(0, 240),
        questionType: ['star_rating', 'options', 'mixed'].includes(q.questionType) ? q.questionType : 'mixed',
        options: Array.isArray(q.options) ? q.options.slice(0, 5) : null,
        context: String(q.context || 'ai_generated').slice(0, 80),
      }));
    }
  } catch (error) {
    console.warn('AI feedback question generation fell back to templates', error);
  }
  return [...feedbackQuestionTemplates].sort(() => Math.random() - 0.5).slice(0, count);
}
