import { Platform } from 'react-native';
import Constants from 'expo-constants';

type RegisterPayload = {
  firstName: string;
  middleName?: string;
  lastName: string;
  dob: string;
  gender?: string;
  civilStatus?: string;
  contact: string;
  address: string;
  email: string;
  password: string;
};

type LoginPayload = {
  email: string;
  password: string;
};

const normalizeBaseUrl = () => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra?.expoClient?.hostUri ||
    '';

  const lanHost = hostUri.split(':')[0];
  const hasLanHost = /^\d{1,3}(\.\d{1,3}){3}$/.test(lanHost);

  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    if (envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      if (hasLanHost) {
        return envUrl.replace('localhost', lanHost).replace('127.0.0.1', lanHost);
      }

      if (Platform.OS === 'android') {
        return envUrl.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
      }
    }

    return envUrl;
  }

  if (hasLanHost) return `http://${lanHost}:5000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://localhost:5000';
};

const API_BASE_URL = normalizeBaseUrl();

async function request<T>(path: string, body: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Cannot reach API server at ${API_BASE_URL}. Ensure your phone and computer are on the same Wi-Fi and backend is running on port 5000.`
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || 'Request failed. Please try again.';
    throw new Error(message);
  }

  return data as T;
}

export async function registerUser(payload: RegisterPayload): Promise<{ message: string; userId: number }> {
  return request('/api/auth/register', payload);
}

export async function loginUser(payload: LoginPayload): Promise<{ message: string; user: { id: number; firstName: string; middleName?: string; lastName: string; dob?: string; gender?: string; civilStatus?: string; contact?: string; address?: string; email: string; avatarUrl?: string | null; profilePhoto?: string | null; role?: string } }> {
  return request('/api/auth/login', payload);
}

export type UserProfile = {
  id: number;
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  gender?: string;
  civilStatus?: string;
  contact: string;
  address: string;
  email: string;
  avatarUrl?: string | null;
  profilePhoto?: string | null;
  createdAt?: string;
};

export async function getUser(userId: number): Promise<{ user: UserProfile }> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/user/${userId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new Error(
      `Cannot reach API server at ${API_BASE_URL}. Ensure your phone and computer are on the same Wi-Fi and backend is running on port 5000.`
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Failed to fetch profile.');
  return data as { user: UserProfile };
}

export async function updateUser(
  userId: number,
  updates: Partial<Omit<UserProfile, 'id' | 'createdAt'>>
): Promise<{ message: string; user: UserProfile }> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/user/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  } catch {
    throw new Error(
      `Cannot reach API server at ${API_BASE_URL}. Ensure your phone and computer are on the same Wi-Fi and backend is running on port 5000.`
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Failed to update profile.');
  return data as { message: string; user: UserProfile };
}

export async function uploadAvatar(
  userId: number,
  base64Image: string,
  mimeType: string
): Promise<{ avatarUrl: string }> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/user/${userId}/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, mimeType }),
    });
  } catch {
    throw new Error(
      `Cannot reach API server at ${API_BASE_URL}. Ensure your phone and computer are on the same Wi-Fi and backend is running on port 5000.`
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Failed to upload avatar.');
  return data as { avatarUrl: string };
}

export type VerifyFaceResponse = {
  verified: boolean;
  confidence?: number;
  score?: number;
  message: string;
  requiresEnrollment?: boolean;
  user?: UserProfile & { role?: string };
};

export async function verifyFace(payload: {
  userId: number;
  image: string;
  mimeType?: string;
}): Promise<VerifyFaceResponse> {
  return request('/api/auth/verify-face', payload);
}

export type EnrollFaceResponse = {
  success: boolean;
  avatarUrl?: string;
  message: string;
  user?: UserProfile & { role?: string };
};

export async function enrollFace(payload: {
  userId: number;
  image: string;
  mimeType?: string;
}): Promise<EnrollFaceResponse> {
  return request('/api/auth/enroll-face', payload);
}
