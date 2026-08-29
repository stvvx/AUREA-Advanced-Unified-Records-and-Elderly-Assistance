/**
 * types/lolo.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared TypeScript types for the LOLO AUREA AI Companion feature.
 *
 * All interfaces used across:
 *   - frontend/services/loloApi.ts
 *   - frontend/hooks/useLolo.ts
 *   - frontend/components/lolo/
 *   - frontend/app/lolo/
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Emotions ────────────────────────────────────────────────────────────────

/**
 * The set of emotions LOLO AUREA can express.
 * The AI backend returns one of these with every response.
 * The frontend uses it to control 3D avatar animations and facial expressions.
 */
export type Emotion =
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'thinking'
  | 'surprised'
  | 'sleepy';

// ─── Chat / Conversation ─────────────────────────────────────────────────────

/** Who sent a message in the conversation. */
export type MessageRole = 'user' | 'assistant';

/**
 * A single chat message in the conversation thread.
 */
export interface Message {
  /** Unique identifier for this message (UUID). */
  id: string;

  /** Who sent this message. */
  role: MessageRole;

  /** The text content of the message. */
  content: string;

  /** The emotion associated with this message (assistant messages only). */
  emotion?: Emotion;

  /** ISO 8601 timestamp of when the message was created. */
  timestamp: string;

  /**
   * If true, this message is currently being "typed" (streaming animation).
   * Used by the chat UI to show a typing indicator.
   */
  isTyping?: boolean;
}

/**
 * A conversation session groups multiple messages under one session ID.
 */
export interface ConversationSession {
  /** UUID of this session. */
  id: string;

  /** The ID of the user who owns this session. */
  userId: number;

  /** All messages in this session, ordered oldest → newest. */
  messages: Message[];

  /** ISO 8601 timestamp of when the session was created. */
  createdAt: string;

  /** ISO 8601 timestamp of the last message in this session. */
  updatedAt: string;
}

// ─── API Request / Response ───────────────────────────────────────────────────

/**
 * Request body sent to POST /api/lolo/chat
 */
export interface ChatRequest {
  /** The authenticated user's ID. */
  userId: number;

  /** The user's text message to LOLO AUREA. */
  message: string;

  /**
   * The current conversation session ID.
   * If omitted, the backend creates a new session.
   */
  conversationId?: string;

  /** ISO 639-1 language code. Default: 'fil' (Filipino). */
  language?: 'fil' | 'en';

  /**
   * Previous messages for conversation context.
   * The backend will use the last N turns (capped by LOLO_CONVERSATION_HISTORY_LIMIT).
   */
  history?: Array<{ role: string; content: string }>;

  /**
   * User profile information for personalisation.
   * The AI uses this to address the user by name.
   */
  userProfile?: {
    firstName?: string;
    lastName?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Response body from POST /api/lolo/chat
 */
export interface ChatResponse {
  /** Whether the request succeeded. */
  success: boolean;

  /** LOLO AUREA's text reply. */
  message: string;

  /** The emotion detected/selected for this response. */
  emotion: Emotion;

  /** The conversation session ID (new or existing). */
  conversationId: string;

  /** Optional: action tag for UI navigation (e.g. "NAVIGATE_DIGITAL_ID"). */
  action?: string;

  /** Optional error message if success is false. */
  error?: string;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

/**
 * Priority levels for long-term memories.
 * Higher priority memories are more likely to be surfaced in future conversations.
 */
export type MemoryPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Categories for classifying memories.
 */
export type MemoryCategory =
  | 'personal'      // Name, age, family members
  | 'health'        // Medical conditions, medications
  | 'preference'    // Likes, dislikes, hobbies
  | 'event'         // Important dates, appointments
  | 'conversation'  // Notable things discussed
  | 'other';

/**
 * A single long-term memory entry for a user.
 */
export interface Memory {
  /** UUID of this memory entry. */
  id: string;

  /** The ID of the user this memory belongs to. */
  userId: number;

  /** The extracted memory fact (e.g. "User's name is Pedro"). */
  content: string;

  /** How important this memory is. */
  priority: MemoryPriority;

  /** What type of memory this is. */
  category: MemoryCategory;

  /** ISO 8601 timestamp of when this memory was created. */
  createdAt: string;

  /** ISO 8601 timestamp of when this memory was last accessed/updated. */
  lastAccessedAt?: string;

  /**
   * The conversation ID from which this memory was extracted.
   * Useful for context tracing.
   */
  sourceConversationId?: string;
}

/**
 * Request body for POST /api/lolo/memory
 * (Manually adding a memory — usually done by the backend automatically.)
 */
export interface CreateMemoryRequest {
  userId: number;
  content: string;
  priority: MemoryPriority;
  category: MemoryCategory;
  sourceConversationId?: string;
}

/**
 * Response from GET /api/lolo/memory
 */
export interface GetMemoriesResponse {
  success: boolean;
  memories: Memory[];
  total: number;
}

/**
 * Response from DELETE /api/lolo/memory/:id
 */
export interface DeleteMemoryResponse {
  success: boolean;
  message: string;
}

// ─── Voice / Speech ───────────────────────────────────────────────────────────

/**
 * Request body for POST /api/lolo/speech/tts
 * (Text-to-Speech: convert text to audio)
 */
export interface TTSRequest {
  text: string;

  /** BCP 47 language tag. Default: 'fil-PH' */
  language?: string;

  /** Speech rate. 1.0 = normal. Range: 0.5 – 2.0 */
  rate?: number;

  /** Pitch. 1.0 = normal. Range: 0.5 – 2.0 */
  pitch?: number;
}

/**
 * Response from POST /api/lolo/speech/tts
 */
export interface TTSResponse {
  success: boolean;

  /** Base64-encoded MP3 audio. */
  audioBase64?: string;

  /** MIME type of the audio (e.g. "audio/mp3"). */
  mimeType?: string;

  /** Duration of the audio in seconds. */
  durationSeconds?: number;

  error?: string;
}

/**
 * Request body for POST /api/lolo/speech/stt
 * (Speech-to-Text: convert audio to text)
 */
export interface STTRequest {
  /** Base64-encoded audio data. */
  audioBase64: string;

  /** MIME type (e.g. "audio/wav", "audio/m4a"). */
  mimeType: string;

  /** BCP 47 language tag. Default: 'fil-PH' */
  language?: string;
}

/**
 * Response from POST /api/lolo/speech/stt
 */
export interface STTResponse {
  success: boolean;

  /** The transcribed text. */
  transcript?: string;

  /** Confidence score from 0.0 to 1.0. */
  confidence?: number;

  error?: string;
}

// ─── Avatar / 3D ─────────────────────────────────────────────────────────────

/**
 * The animation state the 3D avatar is currently in.
 */
export type AvatarAnimationState =
  | 'idle'       // Standing/sitting, gentle breathing
  | 'talking'    // Mouth moving, gestures
  | 'thinking'   // Head tilt, hand on chin
  | 'listening'  // Leaning forward, attentive
  | 'happy'      // Smiling, nodding
  | 'sad'        // Drooped posture
  | 'excited'    // Energetic, leaning forward
  | 'surprised'  // Raised eyebrows, open mouth
  | 'sleepy';    // Drooping eyes, yawning

/**
 * Viseme (mouth shape) data for lip-sync animation.
 * Maps a phoneme to a mouth open amplitude.
 */
export interface VisemeFrame {
  /** Phoneme being pronounced (e.g. "A", "O", "M", "neutral"). */
  phoneme: string;

  /** Mouth open amplitude: 0.0 (closed) to 1.0 (wide open). */
  amplitude: number;

  /** Timestamp in milliseconds relative to the start of speech. */
  timeMs: number;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

/**
 * The overall UI state of the LOLO AUREA companion screen.
 */
export type CompanionUIState =
  | 'idle'        // Waiting for user input
  | 'listening'   // Mic is active, recording user speech
  | 'processing'  // Waiting for AI response
  | 'speaking'    // LOLO AUREA is playing TTS audio
  | 'error';      // An error occurred

/**
 * Settings configurable by the user.
 */
export interface LoloSettings {
  /** Whether voice responses are enabled. */
  voiceEnabled: boolean;

  /** BCP 47 language for conversations. */
  language: 'fil' | 'en';

  /** TTS speech rate (0.5 – 2.0). */
  speechRate: number;

  /** TTS pitch (0.5 – 2.0). */
  speechPitch: number;

  /** Whether to show the 3D avatar. */
  avatarEnabled: boolean;

  /** Whether to show subtitles when LOLO speaks. */
  subtitlesEnabled: boolean;
}

/**
 * Default settings for new users.
 */
export const DEFAULT_LOLO_SETTINGS: LoloSettings = {
  voiceEnabled: true,
  language: 'fil',
  speechRate: 0.93,
  speechPitch: 0.95,
  avatarEnabled: true,
  subtitlesEnabled: true,
};
