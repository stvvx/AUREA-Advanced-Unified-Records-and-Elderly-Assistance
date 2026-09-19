import { API_BASE_URL } from './loloApi';

export type ChatMessage = {
  id: string;
  userId: number;
  senderId: number;
  senderRole: 'user' | 'osca admin' | 'super admin' | 'admin';
  senderName: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export type ChatThread = {
  userId: number;
  userName: string;
  avatarUrl?: string | null;
  contact?: string;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderRole: string;
  lastSenderName: string;
  unreadCount: number;
};

export async function fetchChatMessages(userId: number, readerRole: string = 'user'): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat/messages?userId=${userId}&readerRole=${encodeURIComponent(readerRole)}`);
    if (!res.ok) {
      throw new Error(`Failed to load messages (${res.status})`);
    }
    const data = await res.json();
    return data.messages ?? [];
  } catch (error) {
    console.warn('[ChatApi] fetchChatMessages error:', error);
    return [];
  }
}

export async function sendChatMessage(params: {
  userId: number;
  senderId: number;
  senderRole: string;
  senderName: string;
  message: string;
}): Promise<ChatMessage | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to send message (${res.status})`);
    }
    const data = await res.json();
    return data.message;
  } catch (error) {
    console.warn('[ChatApi] sendChatMessage error:', error);
    throw error;
  }
}

export async function fetchChatThreads(): Promise<ChatThread[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat/threads`);
    if (!res.ok) {
      throw new Error(`Failed to load threads (${res.status})`);
    }
    const data = await res.json();
    return data.threads ?? [];
  } catch (error) {
    console.warn('[ChatApi] fetchChatThreads error:', error);
    return [];
  }
}

export async function fetchUnreadCount(userId?: number, role: string = 'user'): Promise<number> {
  try {
    const query = new URLSearchParams();
    query.set('role', role);
    if (userId) query.set('userId', userId.toString());

    const res = await fetch(`${API_BASE_URL}/api/chat/unread-count?${query.toString()}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.unreadCount ?? 0;
  } catch (error) {
    return 0;
  }
}
