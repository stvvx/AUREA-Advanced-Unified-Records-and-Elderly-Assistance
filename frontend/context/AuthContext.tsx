import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { revokeUserSession, validateUserSession, type ChildProfile } from '../lib/authApi';

type User = {
  id: number;
  token?: string;
  tokenExpiresAt?: string;
  firstName: string;
  lastName: string;
  email: string;
  middleName?: string;
  dob?: string;
  gender?: string;
  civilStatus?: string;
  category?: string;
  sourceOfIncome?: 'Pension' | 'Allowance' | 'Working' | null;
  occupation?: string | null;
  spouse?: string;
  monthlyIncome?: number | string | null;
  contact?: string;
  address?: string;
  avatarUrl?: string | null;
  profilePhoto?: string | null;
  birthcert?: string | null;
  oscaIdNumber?: string;
  role?: string;
  children?: ChildProfile[];
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (user: User) => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  updateProfile: async () => {},
  logout: async () => {},
});

const STORAGE_KEY = '@aurea_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = !!user;

  // Restore session on app launch
  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (!active || !raw) return;

        try {
          const saved: User = JSON.parse(raw);
          if (!saved.token || !saved.tokenExpiresAt || !Number.isFinite(Date.parse(saved.tokenExpiresAt)) || Date.parse(saved.tokenExpiresAt) <= Date.now()) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            return;
          }
          try {
            if (!(await validateUserSession(saved.token))) {
              await AsyncStorage.removeItem(STORAGE_KEY);
              return;
            }
          } catch {
            // Keep a locally unexpired session available during a network outage.
          }
          if (active) setUser(saved);
        } catch {
          AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (userData: User) => {
    const normalizedUser: User = {
      id: userData.id,
      token: userData.token,
      tokenExpiresAt: userData.tokenExpiresAt,
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      middleName: userData.middleName ?? '',
      dob: userData.dob ?? '',
      gender: userData.gender ?? '',
      civilStatus: userData.civilStatus ?? '',
      category: userData.category ?? 'Not Specified',
      spouse: userData.spouse ?? '',
      sourceOfIncome: userData.sourceOfIncome ?? null,
      occupation: userData.occupation ?? null,
      monthlyIncome: userData.monthlyIncome ?? null,
      contact: userData.contact ?? '',
      address: userData.address ?? '',
      avatarUrl: userData.avatarUrl ?? userData.profilePhoto ?? null,
      profilePhoto: userData.profilePhoto ?? userData.avatarUrl ?? null,
      role: userData.role ?? 'user',
      children: userData.children ?? [],
      oscaIdNumber: userData.oscaIdNumber ?? '',
      birthcert: userData.birthcert ?? null,
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
    setUser(normalizedUser);
  };

  const updateProfile = async (updates: Partial<User>) => {
    setUser((current) => {
      if (!current) return null;

      const nextUser: User = {
        ...current,
        ...updates,
        avatarUrl: updates.avatarUrl ?? updates.profilePhoto ?? current.avatarUrl ?? current.profilePhoto ?? null,
        profilePhoto: updates.profilePhoto ?? updates.avatarUrl ?? current.profilePhoto ?? current.avatarUrl ?? null,
      };

      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser)).catch(() => undefined);
      return nextUser;
    });
  };

  const logout = async () => {
    if (user?.token) await revokeUserSession(user.token);
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, login, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
