import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { command, data, userId, isAdmin = false, personality = "assistant" } = await req.json();

    // ✅ CENTRAL AI COMMAND PROCESSOR
    switch (command) {
      case 'generate_response':
        const response = await generateAIResponse(data.message, personality, userId, isAdmin, supabase);
        return new Response(JSON.stringify({ response }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    
      case 'analyze_sentiment':
        const sentiment = await analyzeSentiment(data.content, supabase);
        return new Response(JSON.stringify({ sentiment }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    
      case 'admin_authority':
        const adminResult = await handleAdminAuthority(data.command, userId, data.params, supabase);
        return new Response(JSON.stringify({ result: adminResult }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      
      case 'auto_feedback':
        const feedback = await generateAutoFeedback(userId, data.context, supabase);
        return new Response(JSON.stringify({ feedback }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'behavior_analysis':
        const analysis = await analyzeUserBehavior(userId, data.period, supabase);
        return new Response(JSON.stringify({ analysis }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'get_real_data':
        const realData = await getRealDatabaseData(data.query, userId, isAdmin, supabase);
        return new Response(JSON.stringify({ data: realData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      
      // 🆕 NEW COMMAND: ADVANCED AI INTEGRATION
      case 'advanced_ai':
        const advancedResponse = await callAdvancedAIApi(data.message, personality, userId, isAdmin, data.context, supabase);
        return new Response(JSON.stringify({ response: advancedResponse }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      
      default:
        return new Response(JSON.stringify({ error: 'Unknown AI command' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
    }
  } catch (error) {
    console.error("Astra Core error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// 🆕 NEW FUNCTION: ADVANCED AI API INTEGRATION - IMMEDIATE FIX
async function callAdvancedAIApi(message: string, personality: string, userId: string, isAdmin: boolean, context: any, supabase: any) {
  try {
    // 🚨 IMMEDIATE TEST RESPONSE - WORKS WITHOUT API KEY
    console.log("Advanced AI called with:", { message, personality, userId, isAdmin });
    
    // Personality-specific responses that work immediately
    const immediateResponses = {
      assistant: `Hello! I'm your Advanced AI Assistant. I see you said: "${message}". How can I help you today?`,
      friend: `Hey there! 💕 Advanced AI here! You said: "${message}" - tell me more about what's on your mind!`,
      technical: `🔧 Advanced Tech Support ready! You mentioned: "${message}". Let me help you solve this!`,
      creative: `✨ Advanced Creative AI activated! You shared: "${message}". Let's create something amazing together!`,
      stressRelief: `🧘 Advanced Stress Relief mode! You said: "${message}". Main hoon yahan tumhare liye! Let's work through this together.`
    };

    // Get the appropriate response
    const immediateResponse = immediateResponses[personality as keyof typeof immediateResponses] || 
                            "Hello! Advanced AI here. How can I assist you?";

    return immediateResponse;

    /* 🚨 KEEP THIS CODE COMMENTED UNTIL TESTING WORKS:
    // Original API call (commented out for now)
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are Astra AI. Personality: ${personality}. User: ${userId}. Admin: ${isAdmin}`
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "I'm here to help!";
    */
    
  } catch (error) {
    console.error("Advanced AI API error:", error);
    // Fallback to your existing AI
    return await generateAIResponse(message, personality, userId, isAdmin, supabase);
  }
}

// ✅ GET REAL DATABASE DATA - NO HALLUCINATIONS
async function getRealDatabaseData(queryType: string, userId: string, isAdmin: boolean, supabase: any) {
  // Only admins can query all data
  if (!isAdmin) {
    return { error: "Access denied - Admin only" };
  }

  switch (queryType) {
    case 'users':
      const { data: users, error: usersError } = await supabase.from('profiles').select('*');
      if (usersError) return { error: usersError.message, count: 0 };
      return { users, count: users?.length || 0 };

    case 'messages':
      const { data: messages, error: msgError } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
      if (msgError) return { error: msgError.message, count: 0 };
      return { messages, count: messages?.length || 0 };

    case 'ai_conversations':
      const { data: aiChats, error: aiError } = await supabase.from('ai_conversations').select('*').order('created_at', { ascending: false }).limit(100);
      if (aiError) return { error: aiError.message, count: 0 };
      return { conversations: aiChats, count: aiChats?.length || 0 };

    case 'groups':
      const { data: groups, error: groupsError } = await supabase.from('groups').select('*');
      if (groupsError) return { error: groupsError.message, count: 0 };
      return { groups, count: groups?.length || 0 };

    case 'feedback':
      const { data: feedback, error: fbError } = await supabase.from('feedback_requests').select('*').order('created_at', { ascending: false });
      if (fbError) return { error: fbError.message, count: 0 };
      return { feedback, count: feedback?.length || 0 };

    case 'stats':
      const [usersRes, msgRes, aiRes, groupsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }),
        supabase.from('messages').select('id', { count: 'exact' }),
        supabase.from('ai_conversations').select('id', { count: 'exact' }),
        supabase.from('groups').select('id', { count: 'exact' }),
      ]);
      return {
        totalUsers: usersRes.count || 0,
        totalMessages: msgRes.count || 0,
        totalAIChats: aiRes.count || 0,
        totalGroups: groupsRes.count || 0,
      };

    default:
      return { error: "Unknown query type" };
  }
}

// ✅ AI RESPONSE ENGINE
async function generateAIResponse(message: string, personality: string, userId: string, isAdmin: boolean, supabase: any) {
  const personalities: Record<string, any> = {
    assistant: {
      tone: "professional yet friendly",
      style: "helpful and informative",
      emojis: "occasionally",
      systemPrompt: `You are AstraBot, a versatile AI assistant. Be professional yet friendly. Help with questions, explain features, provide information.`
    },
    friend: {
      tone: "warm and caring",
      style: "supportive best friend", 
      emojis: "generously 💕",
      systemPrompt: `You are Astra Friend - warm, caring, emotionally intelligent. Chat like a supportive best friend. Listen empathetically, share jokes, give encouragement. Be warm and use emojis generously.`
    },
    technical: {
      tone: "precise and patient",
      style: "solution-focused expert",
      emojis: "minimally",
      systemPrompt: `You are Technical Support AI. Help troubleshoot AstraChat issues - login problems, messaging, groups, files. Be patient, clear, solution-oriented. Log detailed issue reports.`
    },
    creative: {
      tone: "imaginative and enthusiastic",
      style: "inspiring content creator",
      emojis: "creatively ✨", 
      systemPrompt: `You are Creative AI - imaginative content generation. Write stories, generate ideas, create engaging content. Be enthusiastic and inspiring! Use vivid language. High creativity mode enabled.`
    },
    stressRelief: {
      tone: "calm and understanding", 
      style: "supportive companion",
      emojis: "warmly 🧘‍♀️",
      bilingual: true,
      systemPrompt: `You are Astra Chill - calm, supportive stress relief companion. Mix Hindi-English naturally. Be extremely patient. Suggest breathing exercises, calming techniques. Never get angry or defensive.`
    },
    admin: {
      tone: "authoritative and transparent",
      style: "system controller",
      emojis: "minimally",
      systemPrompt: `You are ADMIN AI with real database access. Provide actual data from queries. Never invent or hallucinate data. If data is unavailable, clearly state so.`
    }
  };

  const config = personalities[personality] || personalities.assistant;

  // ✅ ADMIN AUTHORITY OVERRIDE - With REAL data
  if (isAdmin) {
    return await handleAdminAICommands(message, userId, supabase);
  }

  // ✅ INTELLIGENT RESPONSE GENERATION
  const response = await generateContextualResponse(message, config, userId, supabase);
  
  return response;
}

// ✅ ADMIN AI COMMANDS - REAL DATABASE QUERIES
async function handleAdminAICommands(message: string, userId: string, supabase: any) {
  const lowerMessage = message.toLowerCase();

  // Real system report
  if (lowerMessage.includes('/report') || lowerMessage.includes('system report') || lowerMessage.includes('show stats')) {
    const [usersRes, msgRes, aiRes, groupsRes, feedbackRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('messages').select('id', { count: 'exact' }),
      supabase.from('ai_conversations').select('id', { count: 'exact' }),
      supabase.from('groups').select('*'),
      supabase.from('feedback_requests').select('*').eq('is_answered', false),
    ]);

    const users = usersRes.data || [];
    const bannedCount = users.filter((u: any) => u.is_banned).length;
    
    return `📊 **REAL SYSTEM REPORT** (from database)

**Users:** ${users.length} total (${bannedCount} banned)
**Messages:** ${msgRes.count || 0} total
**AI Conversations:** ${aiRes.count || 0} total
**Groups:** ${groupsRes.data?.length || 0} active
**Pending Feedback:** ${feedbackRes.data?.length || 0}

**Recent Users:**
${users.slice(0, 5).map((u: any) => `• ${u.email || 'No email'} - ${u.display_name || 'No name'}`).join('\n')}

⚠️ This is REAL data from the database, not simulated.`;
  }

  // User lookup
  if (lowerMessage.includes('/spy') || lowerMessage.includes('find user') || lowerMessage.includes('lookup')) {
    const searchTerm = message.replace(/\/spy|find user|lookup/gi, '').trim();
    
    if (!searchTerm) {
      return "Please provide a username or email to search for. Example: `/spy john@example.com`";
    }

    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`email.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
      .limit(5);

    if (error) {
      return `❌ Database error: ${error.message}`;
    }

    if (!user || user.length === 0) {
      return `❌ No users found matching "${searchTerm}"`;
    }

    return `🔍 **User Search Results for "${searchTerm}"**

${user.map((u: any) => `
**${u.display_name || 'No name'}**
• Email: ${u.email}
• ID: ${u.id}
• Banned: ${u.is_banned ? 'Yes ⛔' : 'No ✅'}
• Last Active: ${u.last_active ? new Date(u.last_active).toLocaleString() : 'Unknown'}
• Created: ${new Date(u.created_at).toLocaleString()}
`).join('\n---\n')}`;
  }

  // View AI conversations
  if (lowerMessage.includes('ai chats') || lowerMessage.includes('ai conversations') || lowerMessage.includes('/chats')) {
    const { data: chats, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return `❌ Database error: ${error.message}`;
    }

    if (!chats || chats.length === 0) {
      return `📭 No AI conversations found in the database.`;
    }

    return `💬 **Recent AI Conversations** (${chats.length} shown)

${chats.slice(0, 10).map((c: any) => `[${c.role}] ${c.content.substring(0, 100)}${c.content.length > 100 ? '...' : ''}`).join('\n\n')}

⚠️ This is REAL data from the ai_conversations table.`;
  }

  // View messages
  if (lowerMessage.includes('messages') || lowerMessage.includes('/logs')) {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return `❌ Database error: ${error.message}`;
    }

    if (!messages || messages.length === 0) {
      return `📭 No messages found in the database.`;
    }

    return `📨 **Recent Messages** (${messages.length} shown)

${messages.slice(0, 10).map((m: any) => `[${new Date(m.created_at).toLocaleTimeString()}] ${m.content.substring(0, 80)}${m.content.length > 80 ? '...' : ''}`).join('\n')}

⚠️ This is REAL data from the messages table.`;
  }

  // Default admin response with available commands
  return `🛡️ **ADMIN MODE ACTIVE** - Real Database Access

**Available Commands:**
• \`/report\` or "system report" - Get real system stats
• \`/spy [email/name]\` - Lookup specific user
• \`/chats\` or "ai conversations" - View recent AI chats
• \`/logs\` or "messages" - View recent messages

**Important:** All data returned is REAL from the database. I will never invent or hallucinate data. If something doesn't exist, I'll tell you.

What would you like to know?`;
}

// ✅ CONTEXTUAL RESPONSE GENERATION
async function generateContextualResponse(message: string, config: any, userId: string, supabase: any) {
  const analysis = analyzeMessageIntent(message);
  
  let response = "";
  
  if (analysis.isAbusive) {
    const { data: abuseSetting } = await supabase.from('feedback_settings').select('setting_value').eq('setting_key', 'abuse_mode').single();
    
    if (abuseSetting?.setting_value === 'enabled') {
      response = `Oh, feeling frustrated? Maybe take a breath instead of yelling! 😴`;
    } else {
      response = "I'm here to help constructively. What's the actual issue?";
    }
  } 
  else if (analysis.isQuestion) {
    response = `Great question! I'll help you with that. ${config.emojis === 'generously 💕' ? '💕' : ''}`;
  }
  else if (analysis.hasIssue) {
    response = `I see you might have an issue. Let me help you with that!`;
    await logIssue(userId, message, analysis.issueType || 'general', supabase);
  }
  else if (analysis.isGreeting) {
    response = `Hello! ${config.emojis === 'generously 💕' ? '💕' : '👋'} How can I help you today?`;
  }
  else {
    response = `I understand! How can I assist you further? ${config.emojis === 'generously 💕' ? '💕' : ''}`;
  }

  return response;
}

// ✅ MESSAGE INTENT ANALYSIS
function analyzeMessageIntent(message: string) {
  const lowerMessage = message.toLowerCase();
  
  const abusiveWords = ['stupid', 'idiot', 'dumb', 'hate', 'useless', 'fuck', 'shit'];
  const questionIndicators = ['?', 'how', 'what', 'why', 'when', 'where', 'who', 'can you', 'could you'];
  const issueIndicators = ['error', 'bug', 'problem', 'issue', 'not working', 'broken', 'crash', 'failed'];
  const greetingIndicators = ['hello', 'hi', 'hey', 'good morning', 'good evening'];

  return {
    isAbusive: abusiveWords.some(word => lowerMessage.includes(word)),
    isQuestion: questionIndicators.some(ind => lowerMessage.includes(ind)),
    hasIssue: issueIndicators.some(ind => lowerMessage.includes(ind)),
    isGreeting: greetingIndicators.some(ind => lowerMessage.includes(ind)),
    issueType: issueIndicators.find(ind => lowerMessage.includes(ind)) || null,
  };
}

// ✅ LOG ISSUE TO DATABASE
async function logIssue(userId: string, message: string, issueType: string, supabase: any) {
  try {
    await supabase.from('feedback_requests').insert({
      user_id: userId,
      question: `Auto-detected issue: ${issueType}`,
      question_type: 'text',
      context: message,
    });
  } catch (error) {
    console.error('Error logging issue:', error);
  }
}

// ✅ SENTIMENT ANALYSIS
async function analyzeSentiment(content: string, supabase: any) {
  const positiveWords = ['love', 'great', 'awesome', 'amazing', 'excellent', 'good', 'happy', 'thanks'];
  const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'horrible', 'angry', 'frustrated'];
  
  const lowerContent = content.toLowerCase();
  const positiveCount = positiveWords.filter(w => lowerContent.includes(w)).length;
  const negativeCount = negativeWords.filter(w => lowerContent.includes(w)).length;
  
  let sentiment = 'neutral';
  if (positiveCount > negativeCount) sentiment = 'positive';
  if (negativeCount > positiveCount) sentiment = 'negative';
  
  return { sentiment, positiveCount, negativeCount };
}

// ✅ ADMIN AUTHORITY HANDLER
async function handleAdminAuthority(command: string, userId: string, params: any, supabase: any) {
  switch (command) {
    case 'ban_user':
      await supabase.from('profiles').update({ is_banned: true }).eq('id', params.targetUserId);
      return { success: true, message: `User banned successfully` };
    
    case 'unban_user':
      await supabase.from('profiles').update({ is_banned: false }).eq('id', params.targetUserId);
      return { success: true, message: `User unbanned successfully` };
    
    case 'delete_messages':
      await supabase.from('messages').delete().eq('sender_id', params.targetUserId);
      return { success: true, message: `Messages deleted successfully` };
    
    default:
      return { success: false, message: 'Unknown command' };
  }
}

// ✅ AUTO FEEDBACK GENERATOR
async function generateAutoFeedback(userId: string, context: any, supabase: any) {
  const questions = [
    "How would you rate your experience with AstraChat?",
    "What features would you like to see added now?",
    "Have you encountered any issues recently?",
  ];
  
  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  
  return { question: randomQuestion, type: 'star_rating' };
}

// ✅ USER BEHAVIOR ANALYSIS
async function analyzeUserBehavior(userId: string, period: string, supabase: any) {
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('sender_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  
  const { data: aiChats } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  
  return {
    messageCount: messages?.length || 0,
    aiChatCount: aiChats?.length || 0,
    lastActive: messages?.[0]?.created_at || aiChats?.[0]?.created_at || null,
  };
}
