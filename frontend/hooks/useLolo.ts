/**
 * hooks/useLolo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central state hook for the LOLO AUREA AI Companion.
 *
 * Responsibilities:
 *   - Manages the full conversation message list
 *   - Sends messages to POST /api/lolo/chat
 *   - Checks backend health via GET /api/lolo/health
 *   - Maintains conversation session ID across turns
 *   - Exposes connection status for the UI
 *   - Persists conversation to AsyncStorage so it survives background/foreground
 *
 * Usage:
 *   const lolo = useLolo({ userId: user.id, userProfile: { firstName: 'Pedro' } });
 *   await lolo.sendMessage("Kumusta Lolo!");
 *   console.log(lolo.messages);     // Message[]
 *   console.log(lolo.lastEmotion);  // Emotion
 *   console.log(lolo.isOnline);     // boolean
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { sendLoloMessage, checkLoloHealth, API_BASE_URL } from '../services/loloApi';
import type { Message, Emotion } from '../types/lolo';

// ─── Storage Key ──────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = '@lolo_conversation_';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface UseLoloOptions {
  /** Authenticated user ID. Required for API calls. */
  userId: number;

  /** User profile fields for AI personalisation. */
  userProfile?: {
    firstName?: string;
    lastName?: string;
  };

  /**
   * Maximum messages to keep in the local history.
   * Older messages are trimmed to prevent memory bloat.
   * @default 100
   */
  maxMessages?: number;

  /**
   * Maximum history entries sent to the AI per request.
   * Lower = faster, less context. Higher = better AI continuity.
   * @default 20
   */
  contextWindowSize?: number;
}

// ─── Return Type ──────────────────────────────────────────────────────────────

export interface UseLoloReturn {
  /** All messages in the current conversation. */
  messages: Message[];

  /** True while waiting for an AI response. */
  isLoading: boolean;

  /** True if the LOLO backend is reachable. */
  isOnline: boolean;

  /** True while the health check is running. */
  isChecking: boolean;

  /** The emotion from the most recent AI reply. */
  lastEmotion: Emotion;

  /** The text of the most recent AI reply. */
  lastReply: string;

  /** The most recent action tag returned by the AI (e.g. "NAVIGATE_DIGITAL_ID"). */
  lastAction: string | null;

  /** The current conversation session ID. */
  conversationId: string | undefined;

  /** AI mode: "gemini" | "knowledge_engine" | "error_fallback". */
  aiMode: string;

  /**
   * Send a message to LOLO AUREA.
   * Adds the user message and LOLO reply to `messages`.
   * @returns The AI response, or null on error.
   */
  sendMessage: (text: string) => Promise<void>;

  /** Manually re-run the health check. */
  checkConnection: () => Promise<void>;

  /** Clear the conversation history. */
  clearConversation: () => void;

  /** Phase 6: Navigate to the memory manager screen. */
  openMemories: () => void;
}


// ─── UUID ─────────────────────────────────────────────────────────────────────

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLolo({
  userId,
  userProfile,
  maxMessages = 100,
  contextWindowSize = 20,
}: UseLoloOptions): UseLoloReturn {

  const [messages, setMessages]           = useState<Message[]>([]);
  const [isLoading, setIsLoading]         = useState(false);
  const [isOnline, setIsOnline]           = useState(true);
  const [isChecking, setIsChecking]       = useState(false);
  const [lastEmotion, setLastEmotion]     = useState<Emotion>('neutral');
  const [lastReply, setLastReply]         = useState('');
  const [lastAction, setLastAction]       = useState<string | null>(null);
  const [aiMode, setAiMode]               = useState('knowledge_engine');
  const [conversationId, setConversationId] = useState<string | undefined>();

  // Ref for the latest messages so callbacks always see current state
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;

  // ── Restore conversation from AsyncStorage ──────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!raw) return;
        try {
          const saved = JSON.parse(raw) as {
            messages: Message[];
            conversationId?: string;
          };
          if (Array.isArray(saved.messages) && saved.messages.length > 0) {
            setMessages(saved.messages.slice(-maxMessages));
            if (saved.conversationId) setConversationId(saved.conversationId);
          }
        } catch {
          // Corrupt storage — ignore
        }
      })
      .catch(() => undefined);
  }, [userId]);

  // ── Persist conversation to AsyncStorage ─────────────────────────────────
  const persistMessages = useCallback(
    (msgs: Message[], convId?: string) => {
      AsyncStorage.setItem(
        storageKey,
        JSON.stringify({ messages: msgs.slice(-maxMessages), conversationId: convId })
      ).catch(() => undefined);
    },
    [storageKey, maxMessages]
  );

  // ── Health Check ─────────────────────────────────────────────────────────

  const checkConnection = useCallback(async () => {
    setIsChecking(true);
    try {
      const health = await checkLoloHealth();
      setIsOnline(health.status === 'ok');
      setAiMode(health.ai?.mode ?? 'knowledge_engine');
    } catch {
      setIsOnline(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Run health check on mount
  useEffect(() => {
    checkConnection();

    // Re-check every 60 seconds
    const interval = setInterval(checkConnection, 60_000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  // ── Send Message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      setIsLoading(true);
      setLastAction(null);

      // 1. Add user message immediately
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      // 2. Add typing indicator
      const typingMsg: Message = {
        id: 'typing',
        role: 'assistant',
        content: '',
        isTyping: true,
        emotion: 'thinking',
        timestamp: new Date().toISOString(),
      };

      const withUser = [...messagesRef.current, userMsg, typingMsg];
      setMessages(withUser);

      try {
        // 3. Build context window (exclude typing indicator)
        const history = messagesRef.current
          .filter((m) => !m.isTyping)
          .slice(-contextWindowSize)
          .map((m) => ({ role: m.role, content: m.content }));

        // 4. Call API
        const response = await sendLoloMessage({
          userId,
          message: trimmed,
          conversationId,
          language: 'fil',
          history,
          userProfile,
        });

        // 5. Update session ID
        if (response.conversationId) {
          setConversationId(response.conversationId);
        }

        const emotion: Emotion = (response.emotion as Emotion) || 'neutral';
        const action = response.action ?? null;

        // 6. Build assistant message
        const assistantMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: response.message,
          emotion,
          timestamp: new Date().toISOString(),
        };

        // 7. Replace typing indicator with real message
        const finalMessages = [
          ...messagesRef.current.filter((m) => m.id !== 'typing'),
          assistantMsg,
        ].slice(-maxMessages);

        setMessages(finalMessages);
        setLastEmotion(emotion);
        setLastReply(response.message);
        setLastAction(action);
        setIsOnline(true);

        // 8. Persist
        persistMessages(finalMessages, response.conversationId);

      } catch (err: any) {
        console.warn('[useLolo] sendMessage error:', err?.message);
        setIsOnline(false);

        // Show graceful error bubble
        const errorMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: 'Paumanhin po, may maliit na abala sa koneksyon. Pakisubukang muli po.',
          emotion: 'sad',
          timestamp: new Date().toISOString(),
        };

        const withError = [
          ...messagesRef.current.filter((m) => m.id !== 'typing'),
          errorMsg,
        ].slice(-maxMessages);

        setMessages(withError);
        setLastEmotion('sad');
        setLastReply(errorMsg.content);
        persistMessages(withError, conversationId);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, conversationId, userId, userProfile, contextWindowSize, maxMessages, persistMessages]
  );

  // ── Clear Conversation ────────────────────────────────────────────────────

  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setLastEmotion('neutral');
    setLastReply('');
    setLastAction(null);
    AsyncStorage.removeItem(storageKey).catch(() => undefined);
  }, [storageKey]);

  // ── Open Memories Screen ──────────────────────────────────────────────────

  const openMemories = useCallback(() => {
    router.push('/memories');
  }, []);

  return {
    messages,
    isLoading,
    isOnline,
    isChecking,
    lastEmotion,
    lastReply,
    lastAction,
    conversationId,
    aiMode,
    sendMessage,
    checkConnection,
    clearConversation,
    openMemories,   // Phase 6
  };
}
