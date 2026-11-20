import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyPhysicalIdScreen() {
  const { service } = useLocalSearchParams<{ service?: string }>();
  if (service === 'philhealth') return <Redirect href="/osca-philhealth" />;
  if (service === 'social-pension') return <Redirect href="/osca-social-pension" />;
  if (service === 'purchase-booklet') return <Redirect href="/osca-purchase-booklet" />;
  if (service === 'osca-transfer') return <Redirect href="/osca-transfer" />;
  return <Redirect href="/osca-physical-id" />;
}
