/**
 * src/lib/ids.ts
 *
 * All ids are client-generated UUIDs, never autoincrement integers. Two phones offline
 * must be able to create rows that do not collide. See ADR 004.
 */

import { randomUUID } from 'expo-crypto'

export function newId(): string {
  return randomUUID()
}
