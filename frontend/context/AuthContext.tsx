import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  middleName?: string;
  dob?: string;
  gender?: string;
  civilStatus?: string;
  contact?: string;
  address?: string;
  avatarUrl?: string | null;
  profilePhoto?: string | null;
  role?: string;
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
      .then((raw) => {
        if (!active || !raw) return;

        try {
          setUser(JSON.parse(raw));
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
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      middleName: userData.middleName ?? '',
      dob: userData.dob ?? '',
      gender: userData.gender ?? '',
      civilStatus: userData.civilStatus ?? '',
      contact: userData.contact ?? '',
      address: userData.address ?? '',
      avatarUrl: userData.avatarUrl ?? userData.profilePhoto ?? null,
      profilePhoto: userData.profilePhoto ?? userData.avatarUrl ?? null,
      role: userData.role ?? 'user',
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
