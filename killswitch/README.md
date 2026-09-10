# Force-update kill switch

`public/` is deployed as-is to Cloudflare Pages. See `docs/09-ENVIRONMENT.md` for setup and
the flip procedure, and ADR 007 in `docs/02-ARCHITECTURE.md` for why it lives here.

```
npx wrangler pages deploy killswitch/public --project-name reader-killswitch
```

The committed payload blocks nothing: every build is at or above `0.1.0`.

To retire builds, raise `minimumVersion`. `latestVersion` must be at or above it, or the app
ignores the whole flag. That rule is what stops one typo from locking every reader out.
