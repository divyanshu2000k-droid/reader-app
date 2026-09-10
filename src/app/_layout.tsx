/**
 * src/app/_layout.tsx
 *
 * Root layout: providers, the launch gates, and the last-resort error boundary.
 * Everything with logic lives in features/launch.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { LaunchGates } from '@/features/launch/LaunchGates'
import { initSentry } from '@/lib/sentry'
import { AppErrorBoundary } from '@/ui/AppErrorBoundary'
import { ToastProvider } from '@/ui/Toast'
import { useIsDark } from '@/ui/useTheme'

// Module scope, unawaited, from expo-splash-screen itself: called from a component it can
// run after the router has already hidden the splash on navigation-ready, and importing
// SplashScreen from 'expo-router' is a silent no-op when the package is missing.
SplashScreen.preventAutoHideAsync().catch(() => undefined)

/** Catches render errors from the whole app. Its fallback has no provider dependencies. */
export const ErrorBoundary = AppErrorBoundary

export default function RootLayout() {
  // Not at module scope: a throw during module evaluation cannot be caught by anything.
  useState(() => initSentry())
  // TanStack Query is for the two search APIs only, never for local data.
  const [queryClient] = useState(() => new QueryClient())
  const isDark = useIsDark()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <LaunchGates>
              <Stack screenOptions={{ headerShown: false }} />
            </LaunchGates>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
