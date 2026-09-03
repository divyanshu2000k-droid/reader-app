# CLAUDE.md

Read `docs/00-START-HERE.md` before doing anything, then the document relevant to the
current slice.

## What this project is

An Android reading tracker built with Expo and React Native. Local first, offline capable,
Android only for v1. Full context is in `docs/`.

## How to work here

**Think like a software architect, not a code generator.** Before implementing, ask what
the decision costs in month six. Prefer boring, explicit and easy to delete.

**The specs are a floor, not a ceiling.** They are thorough but incomplete. Actively hunt
for what is missing. For every screen ask: what if this fails, what if the data is empty
or enormous or malformed, what if the app is backgrounded here, what on a 360px phone,
what if they tap twice, what offline. When you find a gap, decide sensibly, write it in
`DECISIONS.md`, and continue. Do not stop and wait, and do not silently skip it.

**Write down why.** Every non-obvious decision goes in `DECISIONS.md` in two or three
lines. This is what lets you rebuild context later when the codebase outgrows what you can
hold at once. It is not optional.

**Disagree when you should.** If a spec decision looks wrong, say so with reasoning, note
it in `DECISIONS.md`, then proceed. What you must never do is silently deviate.

## Non-negotiable rules

1. **Local first.** Every read comes from SQLite. Every write goes to SQLite first and
   returns immediately. The UI never waits on the network. A loading spinner over the
   user's own data is a bug.
2. **Never lose data.** Soft deletes everywhere. Undo on every destructive action. Backup
   before every migration.
3. **All colours, spacing, radii and type sizes come from `src/ui/theme.ts`.** A hardcoded
   hex in a component is a bug regardless of how small.
4. **All IDs are client generated UUIDs.** Never auto increment.
5. **All timestamps are UTC unix milliseconds**, formatted at render time. All date logic
   lives in `src/lib/dates.ts` and nowhere else imports date-fns.
6. **All SQL lives in `queries.ts` files.** Never inline a query in a component.
7. **Repeated and shared copy lives in `src/lib/strings.ts`** (button labels, errors,
   empty states, confirmations). Screen-specific prose stays inline.
8. **200 lines or one clear responsibility, whichever is larger.** A smell detector, not
   a law. `schema.ts` and `theme.ts` legitimately exceed it.
9. **Features never import from other features.** Only from `ui/`, `db/`, `domain/` and
   `lib/`. Shared business logic goes in `domain/`, not `lib/`.
10. **No `any`.** TypeScript strict, always.
11. **No CSS-only values.** React Native has no `radial-gradient`, no `box-shadow`
    strings, no `calc()`. The theme's `glowSpec` explains the gradient approach.

## Agent skills

Installed and expected to be used:

- **`expo/skills`** for current Expo API patterns, Router conventions, EAS config
- **`react-native-best-practices`** (Callstack) for RN performance, especially list tuning

These carry current framework detail that a static spec cannot. **Where a skill contradicts
`docs/` on framework mechanics, the skill wins** and you note it in `DECISIONS.md`. Where
they touch product decisions, `docs/` wins.

## Commands

```
npx expo run:android      # build and run locally, free and unlimited
npx expo start            # dev server, after a build exists
npx drizzle-kit generate  # create a migration after editing schema.ts
npx tsc --noEmit          # typecheck
```

Build locally for day to day work. EAS is for release builds only.

## Current state

Slice 0, not started. See `docs/05-BUILD-PLAN.md`.

Update this line at the end of every slice.
