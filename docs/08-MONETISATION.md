# MONETISATION

Scattered across four documents until now. This is the single source.

Read the honest assessment first, because it changes what you build and what you expect.

---

## The structural problem, stated plainly

Our strongest positioning promise is **"anything you logged is free, forever."** It is
right, it is a genuine differentiator, and the research supports it: the angriest reviews
in this category are about being charged to see your own book count or genre breakdown.

It also removes the thing every competitor sells.

Bookly sells you your own library past ten books. Hardcover sells you your own genres.
Bookmory sells you your own statistics. We have ruled all of that out, deliberately. So
Plus can only contain things we **compute** or **supply**, never things the user typed in.

That is a smaller surface than most apps have, and pretending otherwise leads to a paywall
nobody buys and a founder confused about why.

---

## What is free, permanently

Unlimited books, unlimited sessions, all core statistics, the reading timer, streaks,
goals, both themes, Goodreads import, full export, no ads in any tier.

This list never shrinks. Adding something to Plus that used to be free is the one move
that would justify the anger the research documents, and we are not going to make it.

---

## Plus at launch, and it is thin

| Feature | Slice | Honest value |
|---|---|---|
| Reading soundscapes while the timer runs | 10 | Proven by Margins, genuinely used |
| Comparative statistics | 10 | The only one with real pull at launch |
| Custom shelf colours and covers | 10 | Cosmetic, but identity sells. **Restyling a cover, not photographing one** — see below |
| Home screen widgets | v1.1 | **Not on the Plus list until it ships** |

**Comparative statistics** is the one that earns money, so make it good. Not "you read 31
books", which is free. Rather: *you read 40% more literary fiction than last year, your pace
doubled in March, you finish audiobooks 30% faster than print.* Computed insight about
their reading, not a readout of their data.

**"Custom shelf colours and covers" does NOT mean photographing a cover.** Decided by the
owner on 2026-09-18: **the camera is free, all three of its uses.** Photographing a cover,
scanning a barcode to add a book, and snapping a page into a note are all free forever. A book
added by hand has no cover at all, and charging to fix that would be charging for the app to
work. The Plus item is restyling a cover the reader already has.

This matters more than it looks, because of the rule at the top of this file: **the free list
never shrinks.** Putting the camera behind Plus later would be exactly the move the research
documents anger about, so it is settled now, before the feature is built.

**Be realistic:** this is not a compelling ₹699 a year on its own. Expect **1 to 2%
conversion at launch**, not the 3% in `01-PRODUCT.md`. Slice 10 is plumbing the payment
rails, not a revenue moment.

---

## Pricing

| | |
|---|---|
| Monthly | ₹99 · roughly $1.20 |
| Annual | ₹699 · roughly $8.40, a 41% saving |
| Trial | 14 days, card required, price and date stated plainly before it ends |

Roughly a seventh of what StoryGraph ($49.99) and Margins ($59.99) charge. Undercut
deliberately at launch and raise later once Plus is worth more.

For the US and UK, price in local currency at a comparable relative level rather than
converting rupees. RevenueCat handles regional pricing.

---

## What makes Plus compelling, in Phase 2

This is the actual monetisation plan. Launch Plus is a placeholder.

**AI recommendations from the user's real library** is the big one. Not bestseller lists,
which are free everywhere. Pattern matching on what *they* rated highly, what they abandoned,
what they read fast. It is computed, so the free-forever promise holds. Nobody in the
category does it well: Fable pulled theirs after biased output, Basmo's is shallow. This
needs rating data to exist first, which is why it cannot be a launch feature.

**Reading Wrapped, premium version.** Free gets one shareable card. Plus gets the full
animated multi-card story. Build it in November, ship in December, and expect the year's
largest conversion spike. It also markets itself for free.

**AI book conversation.** Ask questions about what you are reading. Costs money per query,
so it needs a paying base to justify. Revisit at 5,000 subscribers.

**Kindle highlight sync**, if the fragile-scrape problem is ever worth solving.

---

## Rules that must not be broken

1. **Nothing the user typed in is ever gated.** Books, sessions, notes, ratings, statistics
   derived from them, and export. Permanently.
2. **Cancelling never locks anything.** Plus features stop; every book, session and number
   stays exactly where it was. Say this on the paywall.
3. **No ads in any tier.** Not even the free one. This is a store-listing claim.
4. **Never sell a feature that does not exist yet.** Widgets came off the Plus list for
   exactly this reason.
5. **State the price and the date before charging.** Basmo has one-star reviews about
   surprise charges. The trial-ending sheet exists for this.
6. **Restore purchase is always reachable.** Needed after every reinstall.

---

## Where money appears in the app

| Surface | Design file | Rule |
|---|---|---|
| Upgrade screen | `Paywall.dc.html` | Lists the **free tier first and in full**, then Plus |
| Trial ending | `Moments.dc.html` | States the exact amount and date |
| Welcome to Plus | `Moments.dc.html` | Confirms the purchase landed |
| Restore purchase | `Moments.dc.html` | Reachable from Upgrade and Account |
| Subscription management | `Account.dc.html` | Links out to Play, never a custom cancel flow |

The paywall listing free first is the inverse of how this category does it, and it is
deliberate. The free tier is the marketing.

---

## What success looks like in year one

Not revenue. **Second-session rate above 40%** and D30 retention above 25%.

If a thousand people use the app weekly and twenty pay, that is a working product with a
thin paywall, and the fix is Phase 2 features. If a thousand people install and two hundred
use it weekly, that is a product problem and no paywall will rescue it.

Get the habit right first. The money follows, and it follows in Phase 2.
