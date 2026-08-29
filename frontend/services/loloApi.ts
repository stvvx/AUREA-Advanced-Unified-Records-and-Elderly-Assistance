/**
 * services/loloApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * API service layer for LOLO AUREA AI Companion.
 *
 * All network calls to the Flask backend go through this file.
 * No other file should directly call fetch() for LOLO endpoints.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  ChatRequest,
  ChatResponse,
  GetMemoriesResponse,
  DeleteMemoryResponse,
} from '../types/lolo';

// ─── Base URL Resolution ──────────────────────────────────────────────────────

/**
 * Resolves the API base URL for the current platform.
 *
 * Priority:
 *  1. EXPO_PUBLIC_API_URL env var (set in frontend/.env)
 *  2. Expo LAN host (same Wi-Fi as dev machine) — great for Android
 *  3. 10.0.2.2 for Android Emulator
 *  4. localhost fallback for web
 */
function resolveBaseUrl(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    '';

  const lanHost = hostUri.split(':')[0];
  const hasLanHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(lanHost);

  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (envUrl) {
    // Replace localhost / 127.0.0.1 with the real LAN IP for Android devices
    if (envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      if (hasLanHost) {
        return envUrl
          .replace('localhost', lanHost)
          .replace('127.0.0.1', lanHost);
      }
      if (Platform.OS === 'android') {
        return envUrl
          .replace('localhost', '10.0.2.2')
          .replace('127.0.0.1', '10.0.2.2');
      }
    }
    return envUrl;
  }

  if (hasLanHost) return `http://${lanHost}:5000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://localhost:5000';
}

export const API_BASE_URL = resolveBaseUrl();

// ─── Generic Request Helper ───────────────────────────────────────────────────

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (err) {
    throw new Error(
      `Cannot reach AUREA server at ${API_BASE_URL}. ` +
        `Make sure the backend is running and your phone is on the same Wi-Fi.`
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error || data?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

// ─── LOLO AUREA Endpoints ────────────────────────────────────────────────────

/**
 * POST /api/lolo/chat
 *
 * Sends a message to LOLO AUREA and receives an AI response with emotion.
 *
 * @example
 * const res = await sendLoloMessage({
 *   userId: 1,
 *   message: "Kumusta Lolo!",
 *   language: "fil",
 * });
 * console.log(res.message);  // "Magandang araw po!"
 * console.log(res.emotion);  // "happy"
 */
export async function sendLoloMessage(
  payload: ChatRequest
): Promise<ChatResponse> {
  return apiRequest<ChatResponse>('/api/lolo/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * GET /api/lolo/health
 *
 * Checks if the LOLO AUREA backend is online and AI is configured.
 * Used by the companion UI to show connection status.
 */
export async function checkLoloHealth(): Promise<{
  status: string;
  ai: { geminiConfigured: boolean; mode: string; model: string };
  features: Record<string, boolean>;
}> {
  return apiRequest('/api/lolo/health');
}

/**
 * GET /api/lolo/memory?userId=:id
 *
 * Fetches all long-term memories for a user.
 * (Available after Phase 6)
 */
export async function getLoloMemories(
  userId: number
): Promise<GetMemoriesResponse> {
  return apiRequest<GetMemoriesResponse>(
    `/api/lolo/memory?userId=${userId}`
  );
}

/**
 * DELETE /api/lolo/memory/:id
 *
 * Deletes a specific memory by ID.
 * (Available after Phase 6)
 */
export async function deleteLoloMemory(
  memoryId: string
): Promise<DeleteMemoryResponse> {
  return apiRequest<DeleteMemoryResponse>(`/api/lolo/memory/${memoryId}`, {
    method: 'DELETE',
  });
}
