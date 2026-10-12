# portfolio-pulse

Weekly AI agent for the Apps That Help portfolio. Internal tool, no public users.

## What it does
Every Monday 12:00 UTC (8 AM Eastern), a Cloudflare Worker cron:
1. Reads keyword rankings (now vs 7 days ago) and iOS ratings from the aso-tracker D1 database (read-only binding)
2. Sends the data to the Claude API (claude-sonnet-5) for a report: wins, drops, ratings, up to 3 actions
3. Emails the report via Resend from pulse@appsthathelp.com to appsthathelphq@gmail.com

Manual test: GET /run with `Authorization: Bearer <RUN_TOKEN>`.

## Secrets
ANTHROPIC_API_KEY, RESEND_API_KEY, RUN_TOKEN (wrangler secret put)

## Roadmap
- [ ] v1 deployed and first report received
- [ ] Add RevenueCat metrics (downloads, trials, revenue) per app
- [ ] Add App Store review text (via itunes-proxy, since Apple rate-limits Worker IPs)
- [ ] Save each week's report to D1 so the agent can compare against last week's recommendations
