# START HERE

You are the software architect and sole engineer for this project. Read every file in
this folder before you write a single line of code.

---

## What this is

An Android reading tracker. Not a clone of anything. It exists because nine competitors
were studied in depth and all of them break in the same specific ways, and those breakages
are documented in `01-PRODUCT.md`. The architecture in `02-ARCHITECTURE.md` is chosen to
make those breakages structurally impossible rather than fixed later.

---

## Prime directives

These override any local convenience. If following one of these makes a task harder,
follow it anyway.

### 1. Think like an architect, not a code generator

Before implementing anything, ask what this decision costs in month six. Prefer the design
that is boring, explicit, and easy to delete. When two approaches are close, pick the one
a stranger could understand without asking you.

You are allowed, and expected, to disagree with these documents. If you find a better
approach, say so in `DECISIONS.md` with your reasoning, then proceed. What you must never
do is silently deviate.

### 2. These documents are the floor, not the ceiling

The designs and specs here are thorough but they are not complete, because nothing ever
is. **Actively look for what is missing.** Every time you build a screen, ask:

- What happens if this fails?
- What happens if the data is empty, enormous, or malformed?
- What happens if the user backgrounds the app here?
- What happens on a 360px wide phone?
- What happens if they tap this twice quickly?
- What happens offline?

When you find a gap, write it down in `DECISIONS.md`, decide sensibly, and keep going.
Do not stop and wait. Do not silently skip it.

### 3. Write down why, always

Every non-obvious decision goes in `DECISIONS.md` as two or three lines: what you chose,
what you rejected, why. This is not documentation theatre. Around eight thousand lines an
AI assistant stops being able to hold the whole codebase in context, and this file is what
lets it get the thread back. It is the cheapest insurance in the project.

Also keep `docs/` updated as you go. If you change the schema, update `03-DATA-MODEL.md`
in the same commit. Stale docs are worse than no docs.

### 4. Local first, always

The app must be fully usable with the network permanently off. Every read comes from the
local SQLite database. Every write goes to SQLite first and returns immediately. The
network is a background sync process that the UI never waits on. If you ever find yourself
writing a loading spinner around the user's own data, you have made a mistake.

### 5. Never lose a user's data

This is the one unforgivable failure in this category, documented with real quotes in
`01-PRODUCT.md`. Soft deletes everywhere. Undo on every destructive action. Backup before
migration. If you are unsure whether something is safe, make it safer.

**And verify it in the direction the guarantee runs.** Every data-loss bug found in this
codebase so far typechecked, linted, threw nothing, and was wrong — the write path that
rolled nothing back, the restore that silently did nothing while reporting success, the
guard that asserted nothing for two tables. Read the silent-pass hazard in `CLAUDE.md`
before writing anything that claims a safety property.

### 6. Small, verifiable steps

Build one vertical slice at a time and make it work end to end before starting the next.
A half-built screen that runs beats four scaffolded screens that do not. After each slice,
the app must launch and do something useful.

---

## Reading order

| File | What it settles |
|---|---|
| `00-START-HERE.md` | This. How to work. |
| `01-PRODUCT.md` | What we are building and the research behind it |
| `02-ARCHITECTURE.md` | Every technology choice and why |
| `03-DATA-MODEL.md` | Schema, sync, migrations |
| `04-SCREENS.md` | Screen by screen behaviour and acceptance criteria |
| `05-BUILD-PLAN.md` | The order to build in |
| `06-CONVENTIONS.md` | Code structure and standards |
| `08-MONETISATION.md` | What is free, what is paid, and why Plus is thin at launch |
| `../PREMORTEM.md` | What kills projects like this. Written for the human |
| `DECISIONS.md` | Running log. You write this. |

**There is no `07-`.** It was the premortem, which now lives as `PREMORTEM.md` at the repo
root. The number is left vacant rather than renumbering, so existing cross references stay
valid. Nothing is missing.

`PREMORTEM.md` is written for the human, not for you, but two things in it bind your work:
the **decision gate after Slice 3** and the rule that the app gets dogfooded from Slice 2.
Both also appear in `05-BUILD-PLAN.md`.

There is also a visual design canvas with 34 artboards, including two system sheets
carrying exact colour, type, spacing, state and motion values. Those sheets are the source
of truth for anything visual. `04-SCREENS.md` covers behaviour; the sheets cover
appearance. Where they disagree, the sheets win on looks and this spec wins on logic.

---

## Before you write any code

Some of these are decide-once and expensive or impossible to change later.

- [ ] **Pick the app name.** Check Play Store and trademark availability, register the
      domain, settle the package id as `com.yourname.appname`. **A package id cannot be
      changed after publishing.** Everything currently says "Reader", which is a
      placeholder and certainly taken
- [ ] Create the Play Console account, $25, because verification can take days
- [ ] Set up local Android builds as the default (`npx expo run:android`, free and
      unlimited). Keep EAS for release builds only
- [ ] `.gitignore` with `.env` in it, before the first commit
- [ ] Write the two week timer limit from `05-BUILD-PLAN.md` Slice 6 into `DECISIONS.md`
      now, while you are calm
- [ ] Diarise the Slice 3 gate as a real date

---

## What done means for Phase 1

A Play Store release that a stranger can install, use for a month without losing anything,
and pay for if they want to. Specifically:

- Every journey in `04-SCREENS.md` terminates properly, no dead ends
- Works fully offline
- Survives a phone upgrade with data intact
- Crash free sessions above 99.5%
- Passes Play Store review, which needs account deletion and a privacy policy
- Under 15MB download, cold start under 2 seconds on a midrange phone

---

## What we are deliberately not building in Phase 1

Written down so you do not relitigate it at 1am:

barcode scanning (v1.1) · social feed · book clubs · AI recommendations · AI book Q&A ·
Kindle highlight sync · a web app · iOS · content warnings · reading challenges ·
tablet layouts · landscape

If one of these feels essential while building, it is not. Note it in `DECISIONS.md` and
move on.
