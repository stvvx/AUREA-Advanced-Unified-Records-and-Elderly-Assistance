import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { useAuth } from '../../context/AuthContext';
import { isAdministrativeRole } from '../../lib/authApi';

export default function TabLayout() {
  const { user, loading } = useAuth();

  // Resolve restored sessions before mounting any resident screens.
  if (loading) return null;

  if (user && isAdministrativeRole(user.role)) {
    return <Redirect href="/admin-dashboard" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
    </Tabs>
  );
}
