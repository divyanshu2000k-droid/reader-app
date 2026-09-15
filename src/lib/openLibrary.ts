/**
 * src/lib/openLibrary.ts
 *
 * Open Library asks every client to identify itself (02-ARCHITECTURE, ADR 005). One value, shared
 * by search (features/add) and by fetching a work's description (db/bookDetails.ts).
 */
export const OPEN_LIBRARY_USER_AGENT = 'Reader/0.1 (Android reading tracker)'
