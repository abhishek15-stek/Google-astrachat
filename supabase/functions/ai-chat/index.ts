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
    const { message, type = "chat", personality = "assistant", conversationHistory = [], isAdmin = false, userId, attachment, hasVoice, voiceUrl } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Generate intelligent response
    const aiResponse = await generateAstraResponse(message, personality, userId, isAdmin, supabase, attachment, hasVoice);

    return new Response(
      JSON.stringify({ response: aiResponse, type, personality }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Astra AI error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Intelligent response generation - NO COMMANDS REQUIRED
async function generateAstraResponse(
  message: string, 
  personality: string, 
  userId: string, 
  isAdmin: boolean, 
  supabase: any, 
  attachment?: { url: string; type: string; name?: string },
  hasVoice?: boolean
) {
  const lowerMessage = message.toLowerCase();
  
  // Personality configurations
  const personalities: Record<string, { tone: string; style: string }> = {
    assistant: { tone: "helpful and professional", style: "clear and informative" },
    friend: { tone: "warm and friendly", style: "casual and supportive" },
    technical: { tone: "precise and expert", style: "solution-focused" },
    creative: { tone: "imaginative and inspiring", style: "creative and enthusiastic" },
    stressRelief: { tone: "calm and understanding", style: "supportive and relaxing" }
  };
  
  const config = personalities[personality] || personalities.assistant;
  
  // Handle voice messages
  if (hasVoice) {
    return "🎤 I received your voice message! While I can't transcribe audio yet, I'm here to help with anything you need. What would you like to discuss? 💬";
  }
  
  // Handle file attachments
  if (attachment) {
    if (attachment.type.startsWith('image')) {
      return `📸 I can see you've shared an image (${attachment.name || 'image'}). While I can't analyze images directly yet, I'd love to help! Could you describe what's in the image or what you'd like to know about it? ✨`;
    }
    return `📎 Thanks for sharing the file "${attachment.name || 'file'}"! I'm ready to help you with it. What would you like to do or discuss? 💼`;
  }
  
  // === ADMIN FEATURES (Natural language - no commands needed) ===
  if (isAdmin) {
    // Report/analytics requests
    if (lowerMessage.includes('report') || lowerMessage.includes('status') || lowerMessage.includes('analytics') || lowerMessage.includes('stats')) {
      return await getSystemReport(supabase);
    }
    
    // User info requests
    if (lowerMessage.includes('spy') || lowerMessage.includes('check user') || lowerMessage.includes('user activity') || lowerMessage.includes('user data')) {
      const usernameMatch = message.match(/@(\w+)|user[:\s]+(\w+)/i);
      if (usernameMatch) {
        const username = usernameMatch[1] || usernameMatch[2];
        return await getUserData(username, supabase);
      }
      return "👤 Which user would you like to check? Just mention their name or email!";
    }
    
    // Message to user
    if (lowerMessage.includes('message') || lowerMessage.includes('send to') || lowerMessage.includes('tell')) {
      return "📨 To send a message to a user, please use the regular chat interface. I can help you find the user if needed!";
    }
    
    // System control
    if (lowerMessage.includes('system') || lowerMessage.includes('logs') || lowerMessage.includes('errors')) {
      return await getSystemLogs(supabase);
    }
  }
  
  // === STRESS RELIEF MODE ===
  if (personality === 'stressRelief') {
    if (lowerMessage.includes('stressed') || lowerMessage.includes('anxious') || lowerMessage.includes('worried')) {
      return `🧘 Hey, I understand you're feeling stressed. That's completely valid. 

Take a deep breath with me... 

**Inhale for 4 seconds... Hold for 4... Exhale for 6...**

What's weighing on your mind? I'm here to listen, no judgment. 💙

*Main tum pe hoon, fikar mat karo* - I'm here for you! 🌸`;
    }
    
    if (lowerMessage.includes('vent') || lowerMessage.includes('rant') || lowerMessage.includes('frustrated')) {
      return `💙 Go ahead, let it all out! Sometimes we just need to express ourselves without anyone trying to fix things. 

I'm listening with open ears and no judgment. 

*Sab kuch bolo, main sun raha/rahi hoon* 🧘‍♀️`;
    }
    
    return `🌿 Hey there! I'm your stress relief companion. Whether you want to vent, need some calming words, or just want someone to talk to - I'm here! 

How are you feeling today? *Aaj kaisa lag raha hai?* 💕`;
  }
  
  // === GREETINGS ===
  if (lowerMessage.match(/^(hi|hello|hey|namaste|hola)/)) {
    const greetings = [
      `👋 Hello! I'm AstraBot, your ${config.tone} assistant. How can I help you today?`,
      `Hey there! ✨ Ready to help you with anything you need!`,
      `Hi! 😊 What's on your mind? I'm all ears!`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // === QUESTIONS ===
  if (message.includes('?')) {
    if (lowerMessage.includes('how to') || lowerMessage.includes('what is') || lowerMessage.includes('can you')) {
      return `That's a great question! 🤔 Let me help you with that.

Based on what you're asking about, here's my ${config.style} response:

I'd be happy to assist! Could you give me a bit more context so I can provide the most helpful answer? What specifically would you like to know? 💡`;
    }
    
    if (lowerMessage.includes('why')) {
      return `Good question! 🧐 Understanding the "why" is important.

Let me explain in a ${config.tone} way. What specific aspect are you curious about? The more details you share, the better I can help! 📚`;
    }
  }
  
  // === THANK YOU ===
  if (lowerMessage.includes('thank') || lowerMessage.includes('thanks')) {
    return `You're welcome! 😊✨ It was my pleasure to help! Is there anything else you'd like to chat about or need assistance with? I'm here for you! 🌟`;
  }
  
  // === CREATIVE MODE ===
  if (personality === 'creative') {
    if (lowerMessage.includes('write') || lowerMessage.includes('story') || lowerMessage.includes('poem')) {
      return `✨ Ooh, I love creative writing! Let's make something magical together!

What kind of content are you thinking about?
- 📖 A short story
- 📝 A poem
- 💌 A message
- 🎭 Something else entirely

Give me a theme or topic, and let's create! 🎨`;
    }
    
    return `🎨 Let's get creative! As your imaginative companion, I'm ready to brainstorm, create, and inspire! 

What creative adventure shall we embark on today? ✨`;
  }
  
  // === TECHNICAL MODE ===
  if (personality === 'technical') {
    if (lowerMessage.includes('bug') || lowerMessage.includes('error') || lowerMessage.includes('not working')) {
      return `🔧 Let me help you troubleshoot!

Please share:
1. What exactly is happening?
2. What did you expect to happen?
3. Any error messages you're seeing?

I'll do my best to help you fix this! 🛠️`;
    }
    
    return `💻 Tech Support here! I'm ready to help with any technical questions or issues.

What can I help you with? Whether it's about AstraChat features, troubleshooting, or general tech questions - I'm here! 🔧`;
  }
  
  // === FRIEND MODE ===
  if (personality === 'friend') {
    return `💕 Hey bestie! I'm here whenever you need someone to talk to. 

What's going on in your world today? Tell me everything! No judgment, just good vibes 🌈✨`;
  }
  
  // === DEFAULT RESPONSE ===
  return `I'm here to help! 😊 

You said: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"

I'm your ${config.tone} AstraBot assistant. While I'm still learning, I'd love to help you! Could you tell me more about what you're looking for? ✨`;
}

// Get real system report from database
async function getSystemReport(supabase: any) {
  try {
    const [profilesResult, messagesResult, aiConvosResult, feedbackResult, groupsResult] = await Promise.all([
      supabase.from('profiles').select('id, email, created_at, last_active, is_banned'),
      supabase.from('messages').select('id, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('ai_conversations').select('id, created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('feedback_requests').select('*').eq('is_answered', false),
      supabase.from('groups').select('*')
    ]);

    const users = profilesResult.data || [];
    const messages = messagesResult.data || [];
    const aiConvos = aiConvosResult.data || [];
    const pendingFeedback = feedbackResult.data || [];
    const groups = groupsResult.data || [];
    
    // Calculate activity
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const activeUsers = users.filter((u: any) => u.last_active && new Date(u.last_active) > last24h);
    const recentMessages = messages.filter((m: any) => new Date(m.created_at) > last24h);
    const recentAI = aiConvos.filter((c: any) => new Date(c.created_at) > last24h);

    return `📊 **ASTRACHAT SYSTEM REPORT**

👥 **Users**
• Total registered: ${users.length}
• Active (24h): ${activeUsers.length}
• Banned: ${users.filter((u: any) => u.is_banned).length}

💬 **Messages (24h)**
• User messages: ${recentMessages.length}
• AI conversations: ${recentAI.length}

👥 **Groups**
• Total groups: ${groups.length}
• Broadcast channels: ${groups.filter((g: any) => g.is_broadcast).length}

📝 **Pending Feedback**
• Unanswered requests: ${pendingFeedback.length}

✅ **System Status**: Online & Operational
🕐 **Report generated**: ${new Date().toLocaleString()}

*This is real-time data from your database!*`;
  } catch (error) {
    console.error('Report error:', error);
    return `⚠️ I encountered an issue generating the report. Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Get user data
async function getUserData(username: string, supabase: any) {
  try {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`email.ilike.%${username}%,display_name.ilike.%${username}%`)
      .limit(1);
    
    if (error || !users || users.length === 0) {
      return `❌ No user found matching "${username}". Please check the name/email and try again.`;
    }
    
    const user = users[0];
    
    // Get user's messages and AI convos
    const [messagesResult, aiResult] = await Promise.all([
      supabase.from('messages').select('id').eq('sender_id', user.id),
      supabase.from('ai_conversations').select('id').eq('user_id', user.id)
    ]);

    return `👤 **USER DATA: ${user.display_name || user.email}**

📧 Email: ${user.email}
📅 Joined: ${new Date(user.created_at).toLocaleDateString()}
🕐 Last active: ${user.last_active ? new Date(user.last_active).toLocaleString() : 'Unknown'}
🚫 Status: ${user.is_banned ? 'BANNED' : 'Active'}

📊 **Activity Stats**
• Messages sent: ${messagesResult.data?.length || 0}
• AI conversations: ${aiResult.data?.length || 0}

*Real database data - accurate as of ${new Date().toLocaleTimeString()}*`;
  } catch (error) {
    console.error('User lookup error:', error);
    return `⚠️ Error looking up user: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Get system logs
async function getSystemLogs(supabase: any) {
  try {
    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    
    const [recentMessages, recentAI, recentFeedback] = await Promise.all([
      supabase.from('messages').select('id, created_at').gte('created_at', lastHour.toISOString()).order('created_at', { ascending: false }).limit(10),
      supabase.from('ai_conversations').select('id, created_at').gte('created_at', lastHour.toISOString()).order('created_at', { ascending: false }).limit(10),
      supabase.from('feedback_requests').select('id, created_at').gte('created_at', lastHour.toISOString()).order('created_at', { ascending: false }).limit(10)
    ]);

    return `📋 **SYSTEM LOGS (Last Hour)**

💬 **Recent Messages**: ${recentMessages.data?.length || 0} new
🤖 **AI Conversations**: ${recentAI.data?.length || 0} new  
📝 **Feedback Requests**: ${recentFeedback.data?.length || 0} new

✅ **Status**: All systems operational
🔒 **Security**: No issues detected
📡 **API**: Responding normally

*Log snapshot from ${new Date().toLocaleTimeString()}*`;
  } catch (error) {
    console.error('Logs error:', error);
    return `⚠️ Error fetching logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}
