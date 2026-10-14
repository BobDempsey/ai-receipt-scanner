# Remaining tasks

Ordered by the least work first.

- [x] Turn on Vercel Web Analytics for production builds only. No analytics token is involved: the setup is the `@vercel/analytics` package plus the dashboard toggle, and the project's only env tokens are the Upstash rate-limit set. The "token an agent created" was a Vercel MCP session credential, which Vercel mints on every `/mcp` connect and expires or revokes on its own; nothing to remove
- [x] Rotate `OPENAI_API_KEY`: new key set in Vercel for Production and Preview and in `.env.local`, redeployed at `be0f762` (`dpl_AmcYTqqC1fz4A1KkgrNA5GvCXYBw`, READY), verified against the subdomain where `/api/extract` returned `isReceipt: true`. Note: this new key was printed into a chat transcript during the push and the old key's revocation in the OpenAI dashboard was not confirmed, so a clean re-rotation is worth doing before ship
- [x] CI on GitHub Actions: lint, typecheck and tests on every push. `.github/workflows/ci.yml` runs `npm ci`, lint, `next typegen`, typecheck and tests on Node 22, green on `main` at `214b946`. No build job and no secrets. The `next typegen` step is load-bearing: `tsc` cannot see the `LayoutProps` type Next 16 generates until it runs
- [x] Vercel Security Checkpoint on the custom domain: resolved on its own. On 2026-10-09 the project has no firewall config and no Attack Challenge Mode (both 404 through the MCP), and every path that returned 403 before, the page, `/about`, the samples and the insights script, now returns 200 with no `X-Vercel-Mitigated` header, and `/api/extract` on the custom domain returns `isReceipt: true`. The earlier 403 was transient automatic bot mitigation, not a setting. The analytics re-check this blocked is also cleared: `/_vercel/insights/script.js` serves 200 on the custom domain and no challenge cookie is set
- [ ] Fix the currency highlight landing on address lines (37 wrong marks, 29 of them `currency`) with a prompt change or a tighter quote shape, then rerun the accuracy harness
- [ ] Playwright for upload to export
- [ ] Ship: portfolio card, resume entry, blog post
- [ ] UI improvements (scope to be decided)
- [ ] Retake `public/screenshots/` with `scripts/capture-screenshots.mjs`, since the stat tiles changed in slice 9 and the UI work will change the page again
