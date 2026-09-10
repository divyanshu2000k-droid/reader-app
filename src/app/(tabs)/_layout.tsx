/** The tab shell: Library, Add (raised), Stats. The bar itself is src/ui/TabBar.tsx. */

import { Tabs } from 'expo-router'

import { TabBar } from '@/ui/TabBar'

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="add" />
      <Tabs.Screen name="stats" />
    </Tabs>
  )
}
