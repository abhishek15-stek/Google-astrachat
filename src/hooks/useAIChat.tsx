import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  AIMessage,
  AIMessageAttachmentData,
  AIPersonality,
  AIConversationSummary,
  StoredConversationMeta,
  DatabaseRetrievalError,
  saveAIMessageToDatabase,
  updateAIMessageErrorState,
  fetchUserAIMessages,
  deleteUserAIConversation,
  deduplicateAIMessages,
  buildConversationSummaries,
  readUserWalMessages,
  readUserConversationMetaList,
  saveUserConversationMetaList,
  getSavedActiveConversationId,
  setSavedActiveConversationId,
  encodeStoredContent,
  decodeDatabaseRow,
} from '@/lib/aiConversationStore';

declare global {
  interface Window {
    __ASTRACHAT_SIMULATE_GEMINI_FAILURE__?: boolean;
  }
}

export function setSimulateGeminiFailure(enabled: boolean) {
  if (typeof window !== 'undefined') {
    window.__ASTRACHAT_SIMULATE_GEMINI_FAILURE__ = enabled;
  }
}

export function isSimulatingGeminiFailure(): boolean {
  if (typeof window !== 'undefined') {
    return Boolean(window.__ASTRACHAT_SIMULATE_GEMINI_FAILURE__);
  }
  return false;
}

interface SendMessageOptions {
  content: string;
  attachment?: AIMessageAttachmentData;
  generateImage?: boolean;
  hasVoice?: boolean;
  voicePromptOverride?: string;
}

interface AIChatContextValue {
  messages: AIMessage[];
  allMessages: AIMessage[];
  conversations: AIConversationSummary[];
  activeConversationId: string;
  personality: AIPersonality;
  isLoadingHistory: boolean;
  isGenerating: boolean;
  hasMoreHistory: boolean;
  retrievalError: string | null;
  lastAIError: string | null;
  setPersonality: (p: AIPersonality) => void;
  selectConversation: (conversationId: string) => void;
  createNewConversation: (title?: string, initialPersonality?: AIPersonality) => string;
  deleteConversation: (conversationId: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  sendMessage: (opts: SendMessageOptions) => Promise<void>;
  retryMessage: (userMessageId: string) => Promise<void>;
  refreshHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  appendAssistantSystemMessage: (content: string) => Promise<void>;
  clearRetrievalError: () => void;
}

const AIChatContext = createContext<AIChatContextValue | undefined>(undefined);

export function AIChatProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const currentUserId = user?.id ?? null;

  const [allMessages, setAllMessages] = useState<AIMessage[]>([]);
  const [convMetaList, setConvMetaList] = useState<StoredConversationMeta[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('default');
  const [personality, setPersonalityState] = useState<AIPersonality>('assistant');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [hasMoreHistory, setHasMoreHistory] = useState<boolean>(false);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
  const [lastAIError, setLastAIError] = useState<string | null>(null);

  const activeUserIdRef = useRef<string | null>(null);
  const lastTimestampRef = useRef<number>(0);
  const allMessagesRef = useRef<AIMessage[]>([]);

  useEffect(() => {
    allMessagesRef.current = allMessages;
  }, [allMessages]);

  // Helper to get a strictly monotonic timestamp so rapid consecutive messages maintain exact order
  const nextMonotonicDate = useCallback((): Date => {
    const now = Date.now();
    const next = Math.max(now, lastTimestampRef.current + 2);
    lastTimestampRef.current = next;
    return new Date(next);
  }, []);

  // Load history from database for a given userId without wiping existing messages on failure
  const loadHistoryForUser = useCallback(
    async (targetUserId: string, isBackgroundRefresh = false) => {
      if (!targetUserId) return;
      if (!isBackgroundRefresh) {
        setIsLoadingHistory(true);
      }
      setRetrievalError(null);

      try {
        const result = await fetchUserAIMessages({
          userId: targetUserId,
          limit: 200,
        });

        // Guard against stale async completion after user switch
        if (activeUserIdRef.current !== targetUserId) return;

        setAllMessages((prev) => {
          const merged = deduplicateAIMessages(
            [...prev.filter((m) => m.userId === targetUserId), ...result.messages],
            targetUserId
          );
          return merged;
        });
        setHasMoreHistory(result.hasMore);
      } catch (err) {
        if (activeUserIdRef.current !== targetUserId) return;
        const msg =
          err instanceof DatabaseRetrievalError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Unable to retrieve conversation history from database.';
        console.error('AI conversation retrieval error:', err);
        setRetrievalError(msg);
        // CRITICAL (Phase 4 & Test 9): Do NOT clear or replace existing messages with [] on retrieval failure!
      } finally {
        if (activeUserIdRef.current === targetUserId) {
          setIsLoadingHistory(false);
        }
      }
    },
    []
  );

  // React to authenticated user ID changes (sign-in, sign-out, account switch)
  useEffect(() => {
    activeUserIdRef.current = currentUserId;

    if (!currentUserId) {
      // User signed out — clear in-memory state immediately so another user can never see it
      setAllMessages([]);
      setConvMetaList([]);
      setActiveConversationId('default');
      setRetrievalError(null);
      setLastAIError(null);
      setIsLoadingHistory(false);
      setIsGenerating(false);
      return;
    }

    // Hydrate immediately from user-isolated WAL for this exact userId so UI is never blank while loading
    const cachedWal = readUserWalMessages(currentUserId);
    const savedMeta = readUserConversationMetaList(currentUserId);
    const savedActiveConv = getSavedActiveConversationId(currentUserId);

    setAllMessages(cachedWal);
    setConvMetaList(savedMeta);
    setActiveConversationId(savedActiveConv || 'default');
    setRetrievalError(null);
    setLastAIError(null);

    // Then fetch and verify from Supabase database
    loadHistoryForUser(currentUserId, cachedWal.length > 0);
  }, [currentUserId, loadHistoryForUser]);

  // Subscribe to realtime changes on public.ai_conversations for this user
  useEffect(() => {
    if (!currentUserId) return;

    const channelName = `ai-conversations-sync-${currentUserId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_conversations',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (activeUserIdRef.current !== currentUserId) return;
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as Record<string, any>;
            if (row && row.user_id === currentUserId) {
              const decoded = decodeDatabaseRow(row);
              setAllMessages((prev) => deduplicateAIMessages([...prev, decoded], currentUserId));
            }
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Record<string, any>;
            if (oldRow?.id) {
              setAllMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const setPersonality = useCallback(
    (nextPersonality: AIPersonality) => {
      setPersonalityState(nextPersonality);
      if (!currentUserId) return;
      setConvMetaList((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((c) => c.id === activeConversationId);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], personality: nextPersonality, updatedAt: new Date().toISOString() };
        } else {
          updated.push({
            id: activeConversationId,
            title: activeConversationId === 'default' ? 'General AI Chat' : 'AI Conversation',
            personality: nextPersonality,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        saveUserConversationMetaList(currentUserId, updated);
        return updated;
      });
    },
    [currentUserId, activeConversationId]
  );

  const selectConversation = useCallback(
    (conversationId: string) => {
      const nextId = conversationId || 'default';
      setActiveConversationId(nextId);
      setLastAIError(null);
      if (currentUserId) {
        setSavedActiveConversationId(currentUserId, nextId);
      }
    },
    [currentUserId]
  );

  const createNewConversation = useCallback(
    (title?: string, initialPersonality?: AIPersonality): string => {
      const newId = `conv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const chosenPersonality = initialPersonality || personality;
      const nowIso = new Date().toISOString();
      const meta: StoredConversationMeta = {
        id: newId,
        title: title?.trim() || 'New Conversation',
        personality: chosenPersonality,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (currentUserId) {
        setConvMetaList((prev) => {
          const next = [meta, ...prev.filter((c) => c.id !== newId)];
          saveUserConversationMetaList(currentUserId, next);
          return next;
        });
        setSavedActiveConversationId(currentUserId, newId);
      }

      setActiveConversationId(newId);
      setPersonalityState(chosenPersonality);
      setLastAIError(null);
      return newId;
    },
    [currentUserId, personality]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!currentUserId) return;
      const targetId = conversationId || 'default';
      const targetMsgIds = allMessagesRef.current
        .filter((m) => m.userId === currentUserId && (m.conversationId || 'default') === targetId)
        .map((m) => m.id);

      setAllMessages((prev) =>
        prev.filter((m) => !(m.userId === currentUserId && (m.conversationId || 'default') === targetId))
      );

      setConvMetaList((prev) => {
        const next = prev.filter((c) => c.id !== targetId);
        saveUserConversationMetaList(currentUserId, next);
        return next;
      });

      if (activeConversationId === targetId) {
        setActiveConversationId('default');
        setSavedActiveConversationId(currentUserId, 'default');
      }

      await deleteUserAIConversation(currentUserId, targetId, targetMsgIds);
    },
    [currentUserId, activeConversationId]
  );

  const clearAllConversations = useCallback(async () => {
    if (!currentUserId) return;
    setAllMessages([]);
    setConvMetaList([]);
    saveUserConversationMetaList(currentUserId, []);
    setActiveConversationId('default');
    setSavedActiveConversationId(currentUserId, 'default');
    setLastAIError(null);
    await deleteUserAIConversation(currentUserId);
  }, [currentUserId]);

  const refreshHistory = useCallback(async () => {
    if (!currentUserId) return;
    await loadHistoryForUser(currentUserId, false);
  }, [currentUserId, loadHistoryForUser]);

  const loadMoreHistory = useCallback(async () => {
    if (!currentUserId || isLoadingHistory) return;
    const currentMsgs = allMessagesRef.current.filter((m) => m.userId === currentUserId);
    if (currentMsgs.length === 0) return;

    const oldest = currentMsgs[0];
    setIsLoadingHistory(true);
    setRetrievalError(null);
    try {
      const result = await fetchUserAIMessages({
        userId: currentUserId,
        limit: 100,
        beforeTimestamp: oldest.timestamp.toISOString(),
      });
      if (activeUserIdRef.current !== currentUserId) return;
      setAllMessages((prev) => deduplicateAIMessages([...result.messages, ...prev], currentUserId));
      setHasMoreHistory(result.hasMore);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load older messages.';
      setRetrievalError(msg);
    } finally {
      if (activeUserIdRef.current === currentUserId) {
        setIsLoadingHistory(false);
      }
    }
  }, [currentUserId, isLoadingHistory]);

  // Execute the AI backend request for a saved userMessage
  const invokeAIForMessage = useCallback(
    async (
      userMessage: AIMessage,
      opts: {
        generateImage?: boolean;
        hasVoice?: boolean;
        voicePromptOverride?: string;
      }
    ) => {
      if (!currentUserId) return;
      const assistantMessageId = crypto.randomUUID();
      const targetConvId = userMessage.conversationId || 'default';
      const targetPersonality = userMessage.personality || personality;

      // Build chronological history for this conversation prior to this message
      const convHistory = allMessagesRef.current
        .filter(
          (m) =>
            m.userId === currentUserId &&
            (m.conversationId || 'default') === targetConvId &&
            m.id !== userMessage.id &&
            m.timestamp.getTime() <= userMessage.timestamp.getTime()
        )
        .slice(-20)
        .map((m) => ({
          role: m.role === 'feedback' ? 'assistant' : m.role,
          content: m.content,
        }));

      const imageKeywords =
        /\b(generate|create|draw|make|design|paint|sketch|illustrate|render)\b.*\b(image|picture|photo|art|illustration|drawing|poster|logo|icon|wallpaper|banner)\b/i;
      const shouldGenerateImage =
        Boolean(opts.generateImage) ||
        /^\/imagine\s+/i.test(userMessage.content) ||
        imageKeywords.test(userMessage.content);

      const promptToSend = opts.voicePromptOverride || userMessage.content;
      const storedUserContent = encodeStoredContent(userMessage);

      setIsGenerating(true);
      setLastAIError(null);

      try {
        if (isSimulatingGeminiFailure()) {
          throw new Error('AI connection issue: Edge Function returned a non-2xx status code (Simulated Gemini Outage)');
        }

        const requestPayload = {
          message: promptToSend,
          messageId: userMessage.id,
          assistantMessageId,
          conversationId: targetConvId,
          personality: targetPersonality,
          conversationHistory: convHistory,
          isAdmin,
          userId: currentUserId,
          generateImage: shouldGenerateImage,
          hasVoice: opts.hasVoice,
          attachment: userMessage.attachment,
          storedUserContent,
        };

        let responseData: { response?: string; images?: string[]; id?: string } | null = null;
        let invokeError: Error | null = null;

        // Try server-side /api/ai-chat first if available, then Supabase Edge Function (or vice versa)
        try {
          const apiRes = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload),
          });
          if (apiRes.ok) {
            const json = await apiRes.json();
            if (json && typeof json.response === 'string' && json.response.trim()) {
              responseData = json;
            }
          } else {
            const errJson = await apiRes.json().catch(() => ({}));
            invokeError = new Error(errJson?.error || `AI server returned status ${apiRes.status}`);
          }
        } catch (err) {
          invokeError = err instanceof Error ? err : new Error(String(err));
        }

        // If /api/ai-chat was not used or failed and Supabase is configured, try supabase.functions.invoke('ai-chat')
        if (!responseData && isSupabaseConfigured) {
          const { data, error } = await supabase.functions.invoke('ai-chat', {
            body: requestPayload,
          });
          if (!error && data && typeof data.response === 'string') {
            responseData = data;
            invokeError = null;
          } else if (error) {
            invokeError = new Error(error.message || 'AI connection issue: Edge Function returned a non-2xx status code');
          }
        }

        if (!responseData || !responseData.response) {
          throw invokeError || new Error('AI connection issue: Edge Function returned a non-2xx status code');
        }

        // If this was a retry of a previously failed message, clear its error status in DB & state
        if (userMessage.status === 'error' || userMessage.errorMessage) {
          const clearedUserMsg = await updateAIMessageErrorState(currentUserId, userMessage, 'sent', undefined);
          setAllMessages((prev) =>
            deduplicateAIMessages(
              prev.map((m) => (m.id === clearedUserMsg.id ? clearedUserMsg : m)),
              currentUserId
            )
          );
        }

        // Save assistant response separately with deterministic ID
        const assistantMsg: AIMessage = {
          id: responseData.id || assistantMessageId,
          userId: currentUserId,
          conversationId: targetConvId,
          conversationTitle: userMessage.conversationTitle,
          role: 'assistant',
          content: responseData.response,
          timestamp: nextMonotonicDate(),
          personality: targetPersonality,
          status: 'sent',
          images: Array.isArray(responseData.images) && responseData.images.length > 0 ? responseData.images : undefined,
          persisted: false,
        };

        setAllMessages((prev) => deduplicateAIMessages([...prev, assistantMsg], currentUserId));

        const savedAssistant = await saveAIMessageToDatabase(assistantMsg);
        if (activeUserIdRef.current === currentUserId) {
          setAllMessages((prev) =>
            deduplicateAIMessages(
              prev.map((m) => (m.id === savedAssistant.message.id ? savedAssistant.message : m)),
              currentUserId
            )
          );
        }
      } catch (err) {
        const errorText =
          err instanceof Error
            ? err.message
            : 'AI connection issue: Edge Function returned a non-2xx status code';
        console.error('AI generation error (user message remains saved):', errorText);
        setLastAIError(errorText);

        // Save error information separately onto the user message record without deleting the user message
        const erroredUserMsg = await updateAIMessageErrorState(currentUserId, userMessage, 'error', errorText);
        if (activeUserIdRef.current === currentUserId) {
          setAllMessages((prev) =>
            deduplicateAIMessages(
              prev.map((m) => (m.id === erroredUserMsg.id ? erroredUserMsg : m)),
              currentUserId
            )
          );
        }
      } finally {
        if (activeUserIdRef.current === currentUserId) {
          setIsGenerating(false);
        }
      }
    },
    [currentUserId, personality, isAdmin, nextMonotonicDate]
  );

  // Phase 3: Complete sequential message saving & AI invocation
  const sendMessage = useCallback(
    async (opts: SendMessageOptions) => {
      if (!currentUserId) return;
      const trimmed = (opts.content || '').trim();
      if (!trimmed && !opts.attachment) return;

      const targetConvId = activeConversationId || 'default';
      const currentMeta = convMetaList.find((c) => c.id === targetConvId);
      const autoTitle =
        currentMeta?.title && currentMeta.title !== 'New Conversation'
          ? currentMeta.title
          : targetConvId === 'default'
          ? 'General AI Chat'
          : trimmed.slice(0, 36) || 'AI Conversation';

      if (currentMeta && currentMeta.title === 'New Conversation' && trimmed) {
        setConvMetaList((prev) => {
          const next = prev.map((c) =>
            c.id === targetConvId ? { ...c, title: autoTitle, updatedAt: new Date().toISOString() } : c
          );
          saveUserConversationMetaList(currentUserId, next);
          return next;
        });
      }

      const userMessage: AIMessage = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        conversationId: targetConvId,
        conversationTitle: autoTitle,
        role: 'user',
        content: trimmed || (opts.attachment ? `[Attached: ${opts.attachment.name || 'File'}]` : ''),
        timestamp: nextMonotonicDate(),
        personality,
        status: 'sent',
        attachment: opts.attachment,
        persisted: false,
      };

      // 1. Update frontend state immediately
      setAllMessages((prev) => deduplicateAIMessages([...prev, userMessage], currentUserId));

      // 2. Save user message to database BEFORE calling AI backend
      const persistenceResult = await saveAIMessageToDatabase(userMessage);
      const persistedUserMsg = persistenceResult.message;

      if (activeUserIdRef.current === currentUserId) {
        setAllMessages((prev) =>
          deduplicateAIMessages(
            prev.map((m) => (m.id === persistedUserMsg.id ? persistedUserMsg : m)),
            currentUserId
          )
        );
      }

      // 3. Invoke AI backend (if AI fails, persistedUserMsg remains saved in DB and UI)
      await invokeAIForMessage(persistedUserMsg, {
        generateImage: opts.generateImage,
        hasVoice: opts.hasVoice,
        voicePromptOverride: opts.voicePromptOverride,
      });
    },
    [currentUserId, activeConversationId, convMetaList, personality, nextMonotonicDate, invokeAIForMessage]
  );

  // Phase 7: Retry failed AI request without duplicating the user message
  const retryMessage = useCallback(
    async (userMessageId: string) => {
      if (!currentUserId || isGenerating) return;
      const existingMsg = allMessagesRef.current.find(
        (m) => m.id === userMessageId && m.userId === currentUserId && m.role === 'user'
      );
      if (!existingMsg) return;

      await invokeAIForMessage(existingMsg, {});
    },
    [currentUserId, isGenerating, invokeAIForMessage]
  );

  const appendAssistantSystemMessage = useCallback(
    async (content: string) => {
      if (!currentUserId || !content.trim()) return;
      const msg: AIMessage = {
        id: crypto.randomUUID(),
        userId: currentUserId,
        conversationId: activeConversationId || 'default',
        role: 'assistant',
        content: content.trim(),
        timestamp: nextMonotonicDate(),
        personality,
        status: 'sent',
        persisted: false,
      };
      setAllMessages((prev) => deduplicateAIMessages([...prev, msg], currentUserId));
      const saved = await saveAIMessageToDatabase(msg);
      if (activeUserIdRef.current === currentUserId) {
        setAllMessages((prev) =>
          deduplicateAIMessages(
            prev.map((m) => (m.id === saved.message.id ? saved.message : m)),
            currentUserId
          )
        );
      }
    },
    [currentUserId, activeConversationId, personality, nextMonotonicDate]
  );

  const clearRetrievalError = useCallback(() => {
    setRetrievalError(null);
  }, []);

  const conversations = useMemo(() => {
    if (!currentUserId) return [];
    return buildConversationSummaries(currentUserId, allMessages, convMetaList);
  }, [currentUserId, allMessages, convMetaList]);

  const messages = useMemo(() => {
    if (!currentUserId) return [];
    const targetConvId = activeConversationId || 'default';
    return allMessages
      .filter((m) => m.userId === currentUserId && (m.conversationId || 'default') === targetConvId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [currentUserId, allMessages, activeConversationId]);

  const contextValue = useMemo<AIChatContextValue>(
    () => ({
      messages,
      allMessages,
      conversations,
      activeConversationId,
      personality,
      isLoadingHistory,
      isGenerating,
      hasMoreHistory,
      retrievalError,
      lastAIError,
      setPersonality,
      selectConversation,
      createNewConversation,
      deleteConversation,
      clearAllConversations,
      sendMessage,
      retryMessage,
      refreshHistory,
      loadMoreHistory,
      appendAssistantSystemMessage,
      clearRetrievalError,
    }),
    [
      messages,
      allMessages,
      conversations,
      activeConversationId,
      personality,
      isLoadingHistory,
      isGenerating,
      hasMoreHistory,
      retrievalError,
      lastAIError,
      setPersonality,
      selectConversation,
      createNewConversation,
      deleteConversation,
      clearAllConversations,
      sendMessage,
      retryMessage,
      refreshHistory,
      loadMoreHistory,
      appendAssistantSystemMessage,
      clearRetrievalError,
    ]
  );

  return <AIChatContext.Provider value={contextValue}>{children}</AIChatContext.Provider>;
}

export function useAIChat() {
  const ctx = useContext(AIChatContext);
  if (!ctx) {
    throw new Error('useAIChat must be used within an AIChatProvider');
  }
  return ctx;
}
