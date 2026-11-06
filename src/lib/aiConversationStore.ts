import { supabase } from '@/integrations/supabase/client';

export type AIPersonality = 'assistant' | 'friend' | 'technical' | 'creative' | 'stressRelief';
export type AIMessageStatus = 'sending' | 'sent' | 'error';

export interface AIMessageAttachmentData {
  url: string;
  type: string;
  name?: string;
}

export interface AIMessage {
  id: string;
  userId: string;
  conversationId: string;
  conversationTitle?: string;
  role: 'user' | 'assistant' | 'feedback';
  content: string;
  timestamp: Date;
  personality?: AIPersonality;
  status?: AIMessageStatus;
  errorMessage?: string;
  attachment?: AIMessageAttachmentData;
  images?: string[];
  persisted?: boolean;
}

export interface AIConversationSummary {
  id: string;
  title: string;
  personality: AIPersonality;
  lastMessage: string;
  updatedAt: Date;
  messageCount: number;
}

interface AstraMetaPayload {
  cid?: string;
  title?: string;
  p?: AIPersonality;
  st?: AIMessageStatus;
  err?: string;
  att?: AIMessageAttachmentData;
  imgs?: string[];
}

const META_PREFIX = '\n<!--astra-meta:';
const META_SUFFIX = '-->';

export class DatabaseRetrievalError extends Error {
  constructor(message: string, public readonly causeError?: unknown) {
    super(message);
    this.name = 'DatabaseRetrievalError';
  }
}

// Global test hook for Test 9 (Simulate a database retrieval failure)
declare global {
  interface Window {
    __ASTRACHAT_SIMULATE_DB_FAILURE__?: boolean;
  }
}

export function setSimulateDatabaseFailure(enabled: boolean) {
  if (typeof window !== 'undefined') {
    window.__ASTRACHAT_SIMULATE_DB_FAILURE__ = enabled;
  }
}

export function isSimulatingDatabaseFailure(): boolean {
  if (typeof window !== 'undefined') {
    return Boolean(window.__ASTRACHAT_SIMULATE_DB_FAILURE__);
  }
  return false;
}

/**
 * Strips any embedded <!--astra-meta:...--> trailer from raw database content
 * so UI components and Admin viewers always display clean text.
 */
export function stripAstraMeta(rawContent: string): string {
  if (!rawContent) return '';
  const idx = rawContent.lastIndexOf(META_PREFIX);
  if (idx === -1) return rawContent;
  return rawContent.slice(0, idx);
}

export function parseAstraMeta(rawContent: string): {
  cleanContent: string;
  meta: AstraMetaPayload;
} {
  if (!rawContent) return { cleanContent: '', meta: {} };
  const idx = rawContent.lastIndexOf(META_PREFIX);
  if (idx === -1 || !rawContent.endsWith(META_SUFFIX)) {
    return { cleanContent: rawContent, meta: {} };
  }
  const cleanContent = rawContent.slice(0, idx);
  const jsonPart = rawContent.slice(idx + META_PREFIX.length, rawContent.length - META_SUFFIX.length);
  try {
    const parsed = JSON.parse(jsonPart) as AstraMetaPayload;
    return { cleanContent, meta: parsed || {} };
  } catch {
    return { cleanContent: rawContent, meta: {} };
  }
}

export function encodeStoredContent(msg: {
  content: string;
  conversationId?: string;
  conversationTitle?: string;
  personality?: AIPersonality;
  status?: AIMessageStatus;
  errorMessage?: string;
  attachment?: AIMessageAttachmentData;
  images?: string[];
}): string {
  const clean = stripAstraMeta(msg.content || '');
  const meta: AstraMetaPayload = {};
  let hasMeta = false;

  if (msg.conversationId && msg.conversationId !== 'default') {
    meta.cid = msg.conversationId;
    hasMeta = true;
  }
  if (msg.conversationTitle) {
    meta.title = msg.conversationTitle;
    hasMeta = true;
  }
  if (msg.personality && msg.personality !== 'assistant') {
    meta.p = msg.personality;
    hasMeta = true;
  }
  if (msg.status && msg.status !== 'sent') {
    meta.st = msg.status;
    hasMeta = true;
  }
  if (msg.errorMessage) {
    meta.err = msg.errorMessage;
    hasMeta = true;
  }
  if (msg.attachment) {
    meta.att = msg.attachment;
    hasMeta = true;
  }
  if (msg.images && msg.images.length > 0) {
    meta.imgs = msg.images;
    hasMeta = true;
  }

  if (!hasMeta) return clean;
  return `${clean}${META_PREFIX}${JSON.stringify(meta)}${META_SUFFIX}`;
}

export function decodeDatabaseRow(row: Record<string, any>): AIMessage {
  const rawContent = String(row.content ?? '');
  const { cleanContent, meta } = parseAstraMeta(rawContent);
  const rowMetadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, any>;

  const conversationId =
    (typeof row.conversation_id === 'string' && row.conversation_id) ||
    (typeof rowMetadata.conversationId === 'string' && rowMetadata.conversationId) ||
    meta.cid ||
    'default';

  const conversationTitle =
    (typeof row.title === 'string' && row.title) ||
    (typeof rowMetadata.conversationTitle === 'string' && rowMetadata.conversationTitle) ||
    meta.title ||
    undefined;

  const personality =
    ((typeof row.personality === 'string' && row.personality) ||
      rowMetadata.personality ||
      meta.p ||
      'assistant') as AIPersonality;

  const status =
    ((typeof row.status === 'string' && row.status) ||
      rowMetadata.status ||
      meta.st ||
      'sent') as AIMessageStatus;

  const errorMessage =
    (typeof row.error_message === 'string' && row.error_message) ||
    (typeof rowMetadata.errorMessage === 'string' && rowMetadata.errorMessage) ||
    meta.err ||
    undefined;

  const attachment = (rowMetadata.attachment || meta.att || undefined) as AIMessageAttachmentData | undefined;
  const images = (Array.isArray(rowMetadata.images) ? rowMetadata.images : meta.imgs) as string[] | undefined;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    conversationId,
    conversationTitle,
    role: (row.role === 'assistant' || row.role === 'feedback' ? row.role : 'user') as 'user' | 'assistant' | 'feedback',
    content: cleanContent,
    timestamp: row.created_at ? new Date(row.created_at) : new Date(),
    personality,
    status: status === 'sending' ? 'sent' : status,
    errorMessage,
    attachment,
    images,
    persisted: true,
  };
}

// ── User-Isolated Write-Ahead Log (localStorage strictly namespaced by userId) ──

function getWalStorageKey(userId: string): string {
  return `astrachat:ai_wal:v2:${userId}`;
}

function getActiveConvStorageKey(userId: string): string {
  return `astrachat:ai_active_conv:v2:${userId}`;
}

function getConvListStorageKey(userId: string): string {
  return `astrachat:ai_conv_meta:v2:${userId}`;
}

export function getSavedActiveConversationId(userId: string): string {
  if (!userId || typeof window === 'undefined') return 'default';
  try {
    return localStorage.getItem(getActiveConvStorageKey(userId)) || 'default';
  } catch {
    return 'default';
  }
}

export function setSavedActiveConversationId(userId: string, conversationId: string): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getActiveConvStorageKey(userId), conversationId || 'default');
  } catch {
    // ignore storage quota errors
  }
}

export interface StoredConversationMeta {
  id: string;
  title: string;
  personality: AIPersonality;
  createdAt: string;
  updatedAt: string;
}

export function readUserConversationMetaList(userId: string): StoredConversationMeta[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getConvListStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserConversationMetaList(userId: string, list: StoredConversationMeta[]): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getConvListStorageKey(userId), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function readUserWalMessages(userId: string): AIMessage[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getWalStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item: any) => item && item.userId === userId && item.id)
      .map((item: any) => ({
        ...item,
        timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
      }));
  } catch {
    return [];
  }
}

export function writeUserWalMessages(userId: string, messages: AIMessage[]): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    const isolated = messages
      .filter((m) => m.userId === userId)
      .slice(-500)
      .map((m) => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      }));
    localStorage.setItem(getWalStorageKey(userId), JSON.stringify(isolated));
  } catch {
    // ignore quota issues
  }
}

export function upsertUserWalMessage(userId: string, message: AIMessage): void {
  if (!userId || message.userId !== userId) return;
  const existing = readUserWalMessages(userId);
  const idx = existing.findIndex((m) => m.id === message.id);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...message };
  } else {
    existing.push(message);
  }
  existing.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  writeUserWalMessages(userId, existing);
}

export function removeUserWalConversation(userId: string, conversationId?: string): void {
  if (!userId) return;
  if (!conversationId) {
    writeUserWalMessages(userId, []);
    return;
  }
  const existing = readUserWalMessages(userId);
  writeUserWalMessages(
    userId,
    existing.filter((m) => (m.conversationId || 'default') !== conversationId)
  );
}

// ── Track whether extended columns exist on remote public.ai_conversations ──
let extendedColumnsSupported: boolean | null = null;

/**
 * Permanently saves a message (user or assistant) to the database with idempotency (onConflict: 'id').
 * Verifies persistence across:
 *   1. Supabase `public.ai_conversations` (extended or 5-column base schema)
 *   2. Supabase `public.ai_memory` backup (in case `ai_conversations` grants were not yet migrated)
 *   3. Server `/api/ai-conversations` backup
 *   4. User-isolated local Write-Ahead Log (`astrachat:ai_wal:v2:${userId}`)
 */
export async function saveAIMessageToDatabase(message: AIMessage): Promise<{
  persisted: boolean;
  message: AIMessage;
  error?: string;
}> {
  if (!message.userId) {
    throw new Error('Cannot save AI message without an authenticated userId');
  }
  if (!message.content || !message.content.trim()) {
    throw new Error('Cannot save an empty AI message');
  }

  const normalized: AIMessage = {
    ...message,
    id: message.id || crypto.randomUUID(),
    conversationId: message.conversationId || 'default',
    personality: message.personality || 'assistant',
    status: message.status === 'sending' ? 'sent' : message.status || 'sent',
    timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp || Date.now()),
  };

  // 1. Immediately write to user-isolated WAL before network I/O
  upsertUserWalMessage(normalized.userId, { ...normalized, persisted: false });

  const encodedContent = encodeStoredContent(normalized);
  const isoCreatedAt = normalized.timestamp.toISOString();
  let dbPersisted = false;
  let lastErrorMsg: string | undefined;

  // 2. Primary persistence: public.ai_conversations
  try {
    if (extendedColumnsSupported !== false) {
      const extendedPayload: Record<string, any> = {
        id: normalized.id,
        user_id: normalized.userId,
        role: normalized.role === 'feedback' ? 'assistant' : normalized.role,
        content: encodedContent,
        created_at: isoCreatedAt,
        conversation_id: normalized.conversationId,
        title: normalized.conversationTitle || null,
        personality: normalized.personality || 'assistant',
        status: normalized.status || 'sent',
        error_message: normalized.errorMessage || null,
        client_message_id: normalized.id,
        metadata: {
          conversationId: normalized.conversationId,
          conversationTitle: normalized.conversationTitle,
          personality: normalized.personality,
          status: normalized.status,
          errorMessage: normalized.errorMessage,
          attachment: normalized.attachment,
          images: normalized.images,
        },
      };

      const { data, error } = await supabase
        .from('ai_conversations')
        .upsert(extendedPayload as any, { onConflict: 'id' })
        .select('id')
        .single();

      if (!error && data?.id) {
        extendedColumnsSupported = true;
        dbPersisted = true;
      } else if (error) {
        const msg = String(error.message || '');
        if (
          error.code === 'PGRST204' ||
          error.code === '42703' ||
          msg.includes('column') ||
          msg.includes('schema cache')
        ) {
          extendedColumnsSupported = false;
        } else {
          lastErrorMsg = msg;
        }
      }
    }

    if (!dbPersisted) {
      // Fallback to original 5-column schema (id, user_id, role, content, created_at)
      const basePayload = {
        id: normalized.id,
        user_id: normalized.userId,
        role: normalized.role === 'feedback' ? 'assistant' : normalized.role,
        content: encodedContent,
        created_at: isoCreatedAt,
      };

      const { data, error } = await supabase
        .from('ai_conversations')
        .upsert(basePayload, { onConflict: 'id' })
        .select('id')
        .single();

      if (!error && data?.id) {
        dbPersisted = true;
      } else if (error) {
        lastErrorMsg = error.message;
      }
    }
  } catch (err) {
    lastErrorMsg = err instanceof Error ? err.message : String(err);
  }

  // 3. Secondary backup in Supabase `public.ai_memory` (which has explicit GRANTs in existing migrations)
  try {
    const memoryRow = {
      id: normalized.id,
      user_id: normalized.userId,
      subject_user_id: normalized.userId,
      kind: 'ai_chat_message',
      importance: 1,
      content: JSON.stringify({
        id: normalized.id,
        user_id: normalized.userId,
        role: normalized.role === 'feedback' ? 'assistant' : normalized.role,
        content: encodedContent,
        created_at: isoCreatedAt,
      }),
      created_at: isoCreatedAt,
      updated_at: new Date().toISOString(),
    };
    const { error: memErr } = await supabase
      .from('ai_memory')
      .upsert(memoryRow, { onConflict: 'id' });
    if (!memErr) {
      dbPersisted = true;
    }
  } catch {
    // ignore if ai_memory is unavailable
  }

  // 4. Server-side API persistence endpoint backup (`/api/ai-conversations`)
  try {
    const res = await fetch('/api/ai-conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: normalized.id,
        user_id: normalized.userId,
        role: normalized.role === 'feedback' ? 'assistant' : normalized.role,
        content: encodedContent,
        created_at: isoCreatedAt,
        conversation_id: normalized.conversationId,
        title: normalized.conversationTitle || null,
        personality: normalized.personality || 'assistant',
        status: normalized.status || 'sent',
        error_message: normalized.errorMessage || null,
      }),
    });
    if (res.ok) {
      dbPersisted = true;
    }
  } catch {
    // ignore if running without /api/ai-conversations
  }

  const finalMessage: AIMessage = {
    ...normalized,
    persisted: dbPersisted,
  };

  upsertUserWalMessage(normalized.userId, finalMessage);

  return {
    persisted: dbPersisted,
    message: finalMessage,
    error: dbPersisted ? undefined : lastErrorMsg,
  };
}

/**
 * Updates the error status of a previously saved user message when Gemini fails,
 * or clears the error status when a retry succeeds.
 * NEVER deletes or overwrites the user's message content.
 */
export async function updateAIMessageErrorState(
  userId: string,
  message: AIMessage,
  status: 'sent' | 'error',
  errorMessage?: string
): Promise<AIMessage> {
  const updated: AIMessage = {
    ...message,
    userId,
    status,
    errorMessage: status === 'error' ? errorMessage : undefined,
  };
  const result = await saveAIMessageToDatabase(updated);
  return result.message;
}

/**
 * Deduplicates an array of AIMessages:
 *  - By exact `id` (keeping the version with richest metadata / latest status)
 *  - By legacy duplicate rows (identical userId, role, clean content, and timestamp within 4 seconds)
 */
export function deduplicateAIMessages(messages: AIMessage[], targetUserId: string): AIMessage[] {
  const byId = new Map<string, AIMessage>();

  for (const msg of messages) {
    if (!msg || msg.userId !== targetUserId) continue;
    const existing = byId.get(msg.id);
    if (!existing) {
      byId.set(msg.id, msg);
    } else {
      // Merge preferring persisted and latest status/error info
      byId.set(msg.id, {
        ...existing,
        ...msg,
        persisted: Boolean(existing.persisted || msg.persisted),
        attachment: msg.attachment || existing.attachment,
        images: msg.images?.length ? msg.images : existing.images,
        errorMessage: msg.status === 'error' ? msg.errorMessage || existing.errorMessage : undefined,
      });
    }
  }

  const sorted = Array.from(byId.values()).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // Collapse legacy duplicate inserts (where client + edge function inserted identical role+content within 4s with different UUIDs)
  const deduplicated: AIMessage[] = [];
  for (const msg of sorted) {
    const prev = deduplicated[deduplicated.length - 1];
    if (
      prev &&
      prev.id !== msg.id &&
      prev.role === msg.role &&
      prev.conversationId === msg.conversationId &&
      prev.content.trim() === msg.content.trim() &&
      Math.abs(msg.timestamp.getTime() - prev.timestamp.getTime()) <= 4000
    ) {
      // Merge into previous
      deduplicated[deduplicated.length - 1] = {
        ...prev,
        persisted: Boolean(prev.persisted || msg.persisted),
        attachment: prev.attachment || msg.attachment,
        images: prev.images?.length ? prev.images : msg.images,
        status: prev.status === 'error' || msg.status === 'error' ? 'error' : 'sent',
        errorMessage: prev.errorMessage || msg.errorMessage,
      };
      continue;
    }
    deduplicated.push(msg);
  }

  return deduplicated;
}

/**
 * Retrieves all saved AI messages for a specific authenticated user.
 * Uses DESC ordering on `created_at` so the most recent messages are ALWAYS fetched
 * (fixing the ascending `.limit(100)` truncation bug), then reverses to chronological ASC order.
 */
export async function fetchUserAIMessages(opts: {
  userId: string;
  limit?: number;
  beforeTimestamp?: string;
}): Promise<{
  messages: AIMessage[];
  hasMore: boolean;
}> {
  const { userId, limit = 200, beforeTimestamp } = opts;
  if (!userId) {
    return { messages: [], hasMore: false };
  }

  if (isSimulatingDatabaseFailure()) {
    throw new DatabaseRetrievalError(
      'Database connection error: Unable to retrieve AI conversation history. Existing messages are preserved.'
    );
  }

  const collected: AIMessage[] = [];
  let primarySucceeded = false;
  let secondarySucceeded = false;
  let primaryError: unknown = null;
  let hasMore = false;

  // 1. Query primary table `public.ai_conversations` (DESC order so latest messages are never cut off!)
  try {
    let query = supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (beforeTimestamp) {
      query = query.lt('created_at', beforeTimestamp);
    }

    const { data, error } = await query;
    if (error) {
      primaryError = error;
    } else if (Array.isArray(data)) {
      primarySucceeded = true;
      if (data.length > limit) {
        hasMore = true;
      }
      const slice = data.slice(0, limit);
      for (const row of slice) {
        if (row && row.user_id === userId) {
          collected.push(decodeDatabaseRow(row));
        }
      }
    }
  } catch (err) {
    primaryError = err;
  }

  // 2. Query backup rows in `public.ai_memory` for this user
  try {
    const { data: memData, error: memError } = await supabase
      .from('ai_memory')
      .select('*')
      .eq('user_id', userId)
      .eq('kind', 'ai_chat_message')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!memError && Array.isArray(memData)) {
      secondarySucceeded = true;
      for (const memRow of memData) {
        if (memRow && memRow.user_id === userId && memRow.content) {
          try {
            const parsed = JSON.parse(memRow.content);
            if (parsed && parsed.user_id === userId) {
              collected.push(decodeDatabaseRow(parsed));
            }
          } catch {
            // ignore malformed row
          }
        }
      }
    }
  } catch {
    // ignore if ai_memory is unreachable
  }

  // 3. Query server `/api/ai-conversations` backup for this user
  try {
    const params = new URLSearchParams({ userId, limit: String(limit) });
    if (beforeTimestamp) params.set('before', beforeTimestamp);
    const res = await fetch(`/api/ai-conversations?${params.toString()}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.rows)) {
        secondarySucceeded = true;
        for (const row of json.rows) {
          if (row && row.user_id === userId) {
            collected.push(decodeDatabaseRow(row));
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 4. Merge user-isolated WAL messages for this exact userId
  const walMessages = readUserWalMessages(userId);
  if (!beforeTimestamp && walMessages.length > 0) {
    for (const walMsg of walMessages) {
      if (walMsg.userId === userId) {
        collected.push(walMsg);
      }
    }
  }

  // If all remote database tiers failed with an error, surface the retrieval error
  // (useAIChat preserves existing in-memory and WAL messages without wiping them)
  if (!primarySucceeded && !secondarySucceeded && primaryError) {
    const errMsg =
      (primaryError as any)?.message ||
      (primaryError instanceof Error ? primaryError.message : 'Failed to fetch AI conversations');
    throw new DatabaseRetrievalError(errMsg, primaryError);
  }

  const deduplicated = deduplicateAIMessages(collected, userId);

  // Update WAL with the merged canonical set
  if (!beforeTimestamp) {
    writeUserWalMessages(userId, deduplicated);
  }

  return {
    messages: deduplicated,
    hasMore,
  };
}

/**
 * Deletes either a single AI conversation or all AI conversations for the authenticated user.
 */
export async function deleteUserAIConversation(
  userId: string,
  conversationId?: string,
  messageIds?: string[]
): Promise<void> {
  if (!userId) return;

  removeUserWalConversation(userId, conversationId);

  try {
    if (conversationId && messageIds && messageIds.length > 0) {
      await supabase
        .from('ai_conversations')
        .delete()
        .eq('user_id', userId)
        .in('id', messageIds);
      await supabase
        .from('ai_memory')
        .delete()
        .eq('user_id', userId)
        .in('id', messageIds);
    } else if (!conversationId) {
      await supabase.from('ai_conversations').delete().eq('user_id', userId);
      await supabase
        .from('ai_memory')
        .delete()
        .eq('user_id', userId)
        .eq('kind', 'ai_chat_message');
    }
  } catch (err) {
    console.error('Error deleting from Supabase ai_conversations:', err);
  }

  try {
    const params = new URLSearchParams({ userId });
    if (conversationId) params.set('conversationId', conversationId);
    await fetch(`/api/ai-conversations?${params.toString()}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, conversationId, messageIds }),
    });
  } catch {
    // ignore
  }
}

/**
 * Builds the list of conversations for a user from their messages + saved conversation metadata.
 */
export function buildConversationSummaries(
  userId: string,
  allMessages: AIMessage[],
  savedMeta: StoredConversationMeta[]
): AIConversationSummary[] {
  const map = new Map<string, AIConversationSummary>();

  // Ensure 'default' conversation always exists
  map.set('default', {
    id: 'default',
    title: 'General AI Chat',
    personality: 'assistant',
    lastMessage: 'Start a conversation with AstraBot',
    updatedAt: new Date(0),
    messageCount: 0,
  });

  for (const meta of savedMeta) {
    if (!meta?.id) continue;
    map.set(meta.id, {
      id: meta.id,
      title: meta.title || (meta.id === 'default' ? 'General AI Chat' : 'New Conversation'),
      personality: meta.personality || 'assistant',
      lastMessage: 'No messages yet',
      updatedAt: meta.updatedAt ? new Date(meta.updatedAt) : new Date(),
      messageCount: 0,
    });
  }

  for (const msg of allMessages) {
    if (msg.userId !== userId) continue;
    const cid = msg.conversationId || 'default';
    const existing = map.get(cid);
    const autoTitle =
      msg.conversationTitle ||
      existing?.title ||
      (cid === 'default'
        ? 'General AI Chat'
        : msg.role === 'user'
        ? msg.content.slice(0, 36).trim() || 'AI Conversation'
        : 'AI Conversation');

    if (!existing) {
      map.set(cid, {
        id: cid,
        title: autoTitle,
        personality: msg.personality || 'assistant',
        lastMessage: msg.content.slice(0, 80),
        updatedAt: msg.timestamp,
        messageCount: 1,
      });
    } else {
      const isNewer = msg.timestamp.getTime() >= existing.updatedAt.getTime();
      map.set(cid, {
        ...existing,
        title:
          existing.title === 'New Conversation' && msg.role === 'user'
            ? msg.content.slice(0, 36).trim() || existing.title
            : msg.conversationTitle || existing.title,
        personality: isNewer && msg.personality ? msg.personality : existing.personality,
        lastMessage: isNewer ? msg.content.slice(0, 80) : existing.lastMessage,
        updatedAt: isNewer ? msg.timestamp : existing.updatedAt,
        messageCount: existing.messageCount + 1,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.id === 'default' && a.messageCount === 0 && b.messageCount > 0) return 1;
    if (b.id === 'default' && b.messageCount === 0 && a.messageCount > 0) return -1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}
