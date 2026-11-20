import React, { createContext, forwardRef, useContext } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from 'react-native';
import { useAppFontScale } from '../context/SettingsContext';

const NestedText = createContext(false);

function scaledStyle(style: TextProps['style'], scale: number, defaultFontSize?: number): TextProps['style'] {
  if (scale === 1) return style;
  const flattened = StyleSheet.flatten(style);
  const size = flattened?.fontSize ?? defaultFontSize;
  const lineHeight = flattened?.lineHeight;
  return [style, {
    ...(typeof size === 'number' ? { fontSize: Math.round(size * scale) } : {}),
    ...(typeof lineHeight === 'number' ? { lineHeight: Math.round(lineHeight * scale) } : {}),
  }];
}

export const Text = forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(function Text(
  { style, children, ...props }, ref,
) {
  const scale = useAppFontScale();
  const nested = useContext(NestedText);
  return (
    <NativeText ref={ref} {...props} style={scaledStyle(style, scale, nested ? undefined : 14)}>
      <NestedText.Provider value>{children}</NestedText.Provider>
    </NativeText>
  );
});

export const TextInput = forwardRef<React.ComponentRef<typeof NativeTextInput>, TextInputProps>(function TextInput(
  { style, ...props }, ref,
) {
  const scale = useAppFontScale();
  return <NativeTextInput ref={ref} {...props} style={scaledStyle(style, scale, 14)} />;
});
