import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ✅ ENHANCED FEEDBACK QUESTIONS WITH CONTEXTUAL INTELLIGENCE
const feedbackQuestionTemplates = [
  {
    question: "How would you rate your overall experience with AstraChat today?",
    questionType: "star_rating",
    options: null,
    context: "general",
    triggers: ["first_login", "daily_checkin", "extended_use"]
  },
  {
    question: "How helpful was the AI assistant for your needs?",
    questionType: "star_rating", 
    options: null,
    context: "ai_usage",
    triggers: ["ai_interaction", "multiple_ai_messages", "problem_solved"]
  },
  {
    question: "What best describes your experience chatting with our AI?",
    questionType: "options",
    options: ["Very Helpful 🌟", "Good 👍", "Okay 😊", "Needs Improvement 🔧"],
    context: "ai_quality",
    triggers: ["ai_conversation_end", "complex_question", "technical_help"]
  },
  {
    question: "How easy was it to use AstraChat features?",
    questionType: "options",
    options: ["Super Easy! 🚀", "Pretty Easy 👌", "It's Okay 🤔", "A bit tricky 😅"],
    context: "usability",
    triggers: ["feature_usage", "ui_interaction", "navigation"]
  },
  {
    question: "Would you recommend AstraChat to your friends?",
    questionType: "options",
    options: ["Definitely! 💯", "Probably Yes 👍", "Maybe 🤔", "Not Sure 😕"],
    context: "nps",
    triggers: ["positive_experience", "long_session", "multiple_logins"]
  },
  {
    question: "Aapko AstraChat ka AI assistant kaisa laga?",
    questionType: "options", 
    options: ["Bahut Accha! 🌟", "Theek Hai 👍", "Thoda Better Ho Sakta 😊", "Kuch Samajh Nahi Aaya 🤔"],
    context: "ai_hindi",
    triggers: ["hindi_conversation", "regional_user", "bilingual_chat"]
  },
  {
    question: "How was your stress relief session today?",
    questionType: "options",
    options: ["Feeling Much Better! 🧘", "Helped a Bit 💆", "It was Okay 😌", "Still Stressed 😔"],
    context: "stress_relief", 
    triggers: ["stress_mode_used", "emotional_message", "frustration_detected"]
  },
  {
    question: "Did we resolve your technical issue properly?",
    questionType: "options",
    options: ["Completely Fixed ✅", "Mostly Fixed 👍", "Partially Fixed 🔧", "Still Broken ❌"],
    context: "technical_support",
    triggers: ["bug_report", "error_message", "complaint_followup"]
  },
  {
    question: "How responsive was our AI to your needs?",
    questionType: "options",
    options: ["Instant Lightning ⚡", "Quick Response 🚀", "Average Speed 🕒", "A bit slow 🐢"],
    context: "response_time",
    triggers: ["multiple_queries", "complex_request", "performance_check"]
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, forceGenerate = false, context = {} } = await req.json();

    // ✅ ENHANCED FEEDBACK SETTINGS WITH ADMIN OVERRIDE
    const { data: settings } = await supabase
      .from('feedback_settings')
      .select('*')
      .in('setting_key', ['auto_feedback_interval', 'feedback_intelligence', 'admin_override'])
      .maybeSingle();

    const intervalHours = settings?.setting_value?.hours || 24;
    const intelligenceEnabled = settings?.setting_value?.intelligence !== false;
    const adminOverride = settings?.setting_value?.admin_override || false;

    // ✅ ADMIN OVERRIDE - FORCE FEEDBACK GENERATION
    if (adminOverride && context.admin_command === 'force_feedback') {
      return await generateAdminFeedback(userId, supabase, context);
    }

    // ✅ INTELLIGENT FEEDBACK TIMING WITH CONTEXT ANALYSIS
    if (!forceGenerate) {
      const shouldSend = await analyzeFeedbackTiming(userId, intervalHours, supabase, context);
      if (!shouldSend.send) {
        return new Response(
          JSON.stringify({ 
            sent: false, 
            reason: shouldSend.reason,
            next_check: shouldSend.nextCheck 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ✅ AI-POWERED QUESTION SELECTION (NO EXTERNAL API)
    const selectedQuestion = await intelligentlySelectQuestion(userId, context, supabase);

    // ✅ CREATE ENHANCED FEEDBACK REQUEST
    const { data: newRequest, error: insertError } = await supabase
      .from('feedback_requests')
      .insert({
        user_id: userId,
        question: selectedQuestion.question,
        question_type: selectedQuestion.questionType,
        options: selectedQuestion.options,
        context: selectedQuestion.context,
        intelligence_data: {
          triggers: selectedQuestion.triggers,
          ai_usage_count: context.aiMessageCount,
          sentiment: context.sentiment,
          conversation_topics: context.topics
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        priority: selectedQuestion.context === 'technical_support' ? 'high' : 'medium'
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // ✅ AUTO-ANALYZE FOR URGENT ISSUES
    if (selectedQuestion.context === 'technical_support' || context.urgency === 'high') {
      await supabase.from('urgent_issues').insert({
        user_id: userId,
        feedback_id: newRequest.id,
        issue_type: 'auto_detected',
        severity: 'high',
        created_at: new Date().toISOString()
      });
    }

    return new Response(
      JSON.stringify({ 
        sent: true, 
        request: newRequest,
        context: selectedQuestion.context,
        intelligence: {
          triggers: selectedQuestion.triggers,
          reasoning: selectedQuestion.reasoning,
          urgency: selectedQuestion.context === 'technical_support' ? 'high' : 'normal'
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Enhanced auto-feedback error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ✅ INTELLIGENT TIMING ANALYSIS
async function analyzeFeedbackTiming(userId: string, intervalHours: number, supabase: any, context: any) {
  // Check recent feedback
  const { data: recentFeedback } = await supabase
    .from('feedback_requests')
    .select('created_at, context')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(3);

  const lastFeedbackTime = recentFeedback?.[0]?.created_at;
  const hoursSinceLastFeedback = lastFeedbackTime
    ? (Date.now() - new Date(lastFeedbackTime).getTime()) / (1000 * 60 * 60)
    : Infinity;

  // ✅ CONTEXT-BASED OVERRIDE - Send immediately for important events
  const urgentContexts = ['bug_report', 'complaint', 'technical_issue', 'user_frustration'];
  if (context.urgent && urgentContexts.includes(context.type)) {
    return { send: true, reason: "Urgent context override" };
  }

  // ✅ AI USAGE BASED TIMING - More frequent for active users
  const { count: recentAICount } = await supabase
    .from('ai_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (recentAICount && recentAICount > 10) {
    // Active AI user - reduce interval
    const activeInterval = Math.max(6, intervalHours / 2); // Minimum 6 hours
    if (hoursSinceLastFeedback < activeInterval) {
      return { 
        send: false, 
        reason: `Active user - next feedback in ${(activeInterval - hoursSinceLastFeedback).toFixed(1)} hours`,
        nextCheck: activeInterval - hoursSinceLastFeedback
      };
    }
  }

  // Standard interval check
  if (hoursSinceLastFeedback < intervalHours) {
    return { 
      send: false, 
      reason: `Last feedback was ${hoursSinceLastFeedback.toFixed(1)} hours ago. Next in ${(intervalHours - hoursSinceLastFeedback).toFixed(1)} hours.`,
      nextCheck: intervalHours - hoursSinceLastFeedback
    };
  }

  return { send: true, reason: "Feedback interval reached" };
}

// ✅ AI-POWERED QUESTION SELECTION (NO EXTERNAL API)
async function intelligentlySelectQuestion(userId: string, context: any, supabase: any) {
  // Analyze user behavior and context
  const userAnalysis = await analyzeUserBehavior(userId, supabase);
  
  // Priority-based selection
  const priorityMap = {
    critical: ['technical_support', 'stress_relief'], // Urgent issues first
    high: ['ai_quality', 'usability', 'bug_report'], // Core experience
    medium: ['general', 'ai_usage', 'nps'], // General feedback
    low: ['ai_hindi', 'response_time'] // Specific contexts
  };

  // Check for urgent contexts
  if (context.urgency === 'high' || userAnalysis.hasTechnicalIssues) {
    const urgentQuestions = feedbackQuestionTemplates.filter(q => 
      priorityMap.critical.includes(q.context)
    );
    if (urgentQuestions.length > 0) {
      const question = urgentQuestions[Math.floor(Math.random() * urgentQuestions.length)];
      return { ...question, reasoning: "Urgent issue detection" };
    }
  }

  // AI-heavy users
  if (userAnalysis.aiMessageCount > 5) {
    const aiQuestions = feedbackQuestionTemplates.filter(q => 
      ['ai_quality', 'ai_usage', 'stress_relief', 'response_time'].includes(q.context)
    );
    if (aiQuestions.length > 0) {
      const question = aiQuestions[Math.floor(Math.random() * aiQuestions.length)];
      return { ...question, reasoning: "High AI usage detected" };
    }
  }

  // New users or general context
  const generalQuestions = feedbackQuestionTemplates.filter(q => 
    priorityMap.medium.includes(q.context) || priorityMap.low.includes(q.context)
  );
  
  const question = generalQuestions[Math.floor(Math.random() * generalQuestions.length)];
  return { ...question, reasoning: "General context selection" };
}

// ✅ USER BEHAVIOR ANALYSIS
async function analyzeUserBehavior(userId: string, supabase: any) {
  const [{ count: aiMessageCount }, { data: recentMessages }, { data: issues }] = await Promise.all([
    supabase.from('ai_conversations').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('messages').select('content').eq('sender_id', userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('issue_reports').select('*').eq('user_id', userId).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  ]);

  // Simple sentiment analysis from message content
  const negativeWords = ['broken', 'error', 'not working', 'hate', 'stupid', 'problem'];
  const hasTechnicalIssues = recentMessages?.some((msg: { content: string }) => 
    negativeWords.some(word => msg.content.toLowerCase().includes(word))
  ) || (issues && issues.length > 0);

  return {
    aiMessageCount: aiMessageCount || 0,
    hasTechnicalIssues,
    recentActivity: recentMessages?.length || 0,
    issueCount: issues?.length || 0
  };
}

// ✅ ADMIN FEEDBACK COMMANDS
async function generateAdminFeedback(userId: string, supabase: any, context: any) {
  // Admin can force specific feedback types or bulk generation
  const { data: users } = await supabase.from('users').select('id').neq('role', 'admin').limit(10);
  
  if (context.command === 'bulk_generate' && users) {
    const results = [];
    for (const user of users) {
      const question = feedbackQuestionTemplates[Math.floor(Math.random() * feedbackQuestionTemplates.length)];
      const { data: request } = await supabase.from('feedback_requests').insert({
        user_id: user.id,
        question: `[ADMIN] ${question.question}`,
        question_type: question.questionType,
        options: question.options,
        context: 'admin_generated',
        admin_override: true
      }).select().single();
      results.push(request);
    }
    
    return new Response(
      JSON.stringify({ 
        sent: true, 
        bulk_generated: true,
        requests: results,
        count: results.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Single admin-driven feedback
  const question = feedbackQuestionTemplates.find(q => q.context === context.feedback_type) || feedbackQuestionTemplates[0];
  
  const { data: newRequest } = await supabase.from('feedback_requests').insert({
    user_id: userId,
    question: `[ADMIN] ${question.question}`,
    question_type: question.questionType,
    options: question.options,
    context: 'admin_command',
    admin_override: true,
    admin_notes: context.admin_notes
  }).select().single();

  return new Response(
    JSON.stringify({ 
      sent: true, 
      request: newRequest,
      admin_command: true 
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
