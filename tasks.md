# Remaining tasks

Ordered by the least work first.

- [x] Turn on Vercel Web Analytics for production builds only. No analytics token is involved: the setup is the `@vercel/analytics` package plus the dashboard toggle, and the project's only env tokens are the Upstash rate-limit set. The "token an agent created" was a Vercel MCP session credential, which Vercel mints on every `/mcp` connect and expires or revokes on its own; nothing to remove
- [ ] Rotate `OPENAI_API_KEY`: create a replacement, set it in Vercel for Production and Preview, update `.env.local`, redeploy, then revoke the old key
- [x] CI on GitHub Actions: lint, typecheck and tests on every push. `.github/workflows/ci.yml` runs `npm ci`, lint, `next typegen`, typecheck and tests on Node 22, green on `main` at `214b946`. No build job and no secrets. The `next typegen` step is load-bearing: `tsc` cannot see the `LayoutProps` type Next 16 generates until it runs
- [ ] Find and clear the Vercel Security Checkpoint the custom domain returns to scripted requests (403, `X-Vercel-Mitigated: challenge`), then rerun the analytics checks against the subdomain. Sign in to the Vercel MCP through `/mcp` first
- [ ] Fix the currency highlight landing on address lines (37 wrong marks, 29 of them `currency`) with a prompt change or a tighter quote shape, then rerun the accuracy harness
- [ ] Playwright for upload to export
- [ ] Ship: portfolio card, resume entry, blog post
- [ ] UI improvements (scope to be decided)
- [ ] Retake `public/screenshots/` with `scripts/capture-screenshots.mjs`, since the stat tiles changed in slice 9 and the UI work will change the page again
