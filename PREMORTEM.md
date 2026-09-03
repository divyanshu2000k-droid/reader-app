# PREMORTEM

**This one is for you, not for Claude Code.** Everything technical that came out of the
premortem has been merged into the specs where it belongs: the analytics taxonomy is in
`docs/01-PRODUCT.md`, secrets and accessibility are in `docs/06-CONVENTIONS.md`, the
Drizzle caveat is in `docs/02-ARCHITECTURE.md`, the decision gate and revised estimates are
in `docs/05-BUILD-PLAN.md`, and the pre-Slice-0 checklist is in `docs/00-START-HERE.md`.

What is left here is the part an AI cannot act on, because it is about you rather than the
code.

---

## What actually kills projects like this

Written by imagining it is six months from now and this failed, then working backwards.
Honest probabilities, most likely first.

| Cause | Odds | The counter |
|---|---|---|
| You lose interest around month four | **High** | Dogfood from Slice 2, gate at Slice 3, act on the answer |
| Timer rabbit hole eats a month | Medium | The two week hard rule in Slice 6 |
| Codebase drifts past assistant context | Medium | `DECISIONS.md` every session, files under 200 lines |
| Scope creep from the deferred list | Medium | The deferred list in `00-START-HERE.md` is the argument |
| A genuine technical blocker | Low | Every hard piece has a named fallback |
| Nobody wants it | Low | 150M frustrated Goodreads users. The demand is real |

**Five of the six are about you, not the code.** The technical plan is sound. The plan for
sustaining eighteen weeks of nights and weekends is the part that needs attention.

---

## The risk nothing in the specs can fix

**You do not currently track your reading.**

Every design decision in this project was made from research rather than from your own felt
experience of the problem. Research narrows that gap. It never closes it.

The failure mode is not that you build the wrong thing. The specs are good enough to
prevent that. It is month five, when the work stops being fun and becomes support tickets
and edge cases and a bug you cannot reproduce, and the thing that normally carries a
founder through that is caring about the problem.

Two mitigations, and neither is optional:

**Dogfood from Slice 2.** Log your real reading in your own app. Not seed data. If you are
not opening it daily by Slice 4, that is information, and it is worth more than another
month of building.

**Honour the Slice 3 gate.** Six weeks in, ten real readers, watch them log a session
without narrating, ask whether they would be annoyed if it vanished. Continue if four say
yes and you have used it daily for two weeks. Otherwise stop or rethink.

The gate exists so that finding this out costs six weeks instead of five months. Diarise it
as a real date now, because you will not want to run it when it arrives.

---

## Timeline, honestly

The build plan says 18 to 22 weeks and that is the number to plan against, not the 9 week
optimistic case. At 15 hours a week that is roughly five months to a Play Store release.

A plan you are already behind on by month two is demoralising in a way that compounds, so
it is worth setting the expectation generously and being pleasantly surprised.

---

## The one sentence version

The architecture is sound and the research is real. The risk is not the code, it is
eighteen weeks of nights and weekends on a problem you do not personally have. Build the
gate at Slice 3, honour it, and use your own app every day until then.
