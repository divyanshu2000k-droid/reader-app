# DECISIONS

Running log. Every non-obvious choice, every gap found in the spec, every deviation.

**This is the most valuable file in the repository.** Around 8000 lines an AI assistant
stops being able to hold the whole codebase in context and starts breaking distant things.
This file is how it gets the thread back. Two or three lines per entry is enough. Skipping
it costs far more later than writing it costs now.

---

## Format

```
## YYYY-MM-DD · Short title
**Chose:** what you did
**Over:** what you rejected
**Because:** the reasoning, one or two sentences
**Revisit if:** the condition that would change this
```

Use it for:
- Any library choice not already in `02-ARCHITECTURE.md`
- Any deviation from these specs, with the reason
- Any gap you found in the spec and how you resolved it
- Any workaround, especially native ones, with the thing it works around
- Anything that took more than an hour to figure out

---

## Seed entries

Copy the reasoning from the architecture doc so the log is self contained.

## 2026-09-03 · React Native with Expo over Flutter
**Chose:** React Native with Expo, latest stable SDK, TypeScript
**Over:** Flutter, native Kotlin, any web wrapper
**Because:** all code is AI written, and TypeScript output quality is meaningfully higher
than Dart. Web wrappers produce the exact slowness Hardcover and StoryGraph get reviewed
badly for.
**Revisit if:** hand coding ever becomes the norm, or widget and foreground service work
proves genuinely unworkable in RN.

## 2026-09-03 · SQLite with Drizzle over WatermelonDB
**Chose:** expo-sqlite plus Drizzle ORM
**Over:** WatermelonDB, Realm, AsyncStorage
**Because:** the model is genuinely relational and every meaningful query is a join or an
aggregate. Drizzle gives compile time typed queries, which catches a whole class of error
before it runs.
**Revisit if:** hand rolled sync becomes more painful than adopting Watermelon's model.

## 2026-09-03 · Supabase over Firebase
**Chose:** Supabase, Postgres plus Auth plus RLS
**Over:** Firebase, PocketBase, Turso, no backend
**Because:** same relational shape on both ends, auth included, and RLS means no API layer
to write at all. Free tier pausing is survivable because the app is local first.
**Revisit if:** free tier terms change, or sync needs outgrow last write wins.

## 2026-09-03 · Sessions as the atomic unit
**Chose:** book → read → session, with an editable date on every session
**Over:** book with start and finish dates, as every competitor does
**Because:** four documented competitor bugs are one modelling error. This makes all four
structurally impossible.
**Revisit if:** never. This is the foundation.

---

## Log

<!-- Add entries below, newest first -->
