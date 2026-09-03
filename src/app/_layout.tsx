/**
 * src/app/_layout.tsx
 *
 * Root layout. Route files stay under 50 lines and compose a feature component; this
 * one only wires the providers every screen needs.
 *
 * The four launch gates (force update, session recovery, restore, then Library) are
 * Slice 1 and land here. See Journey A in docs/04-SCREENS.md.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ToastProvider } from '@/ui/Toast'
import { useIsDark } from '@/ui/useTheme'

export default function RootLayout() {
  // TanStack Query is for the two search APIs only, never for local data.
  const [queryClient] = useState(() => new QueryClient())
  const isDark = useIsDark()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false }} />
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
