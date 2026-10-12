# Portfolio Pulse

A weekly AI agent for the Apps That Help app portfolio (appsthathelp.com).

Every Monday morning it runs on its own, with no one starting it:

1. **Gathers data:** reads App Store and Google Play keyword rankings (this week vs. last week) and App Store ratings from my ASO tracker's database (Cloudflare D1).
2. **Analyzes:** sends the data to the Claude API, which writes a report: biggest wins, biggest drops, ratings, and up to 3 recommended actions, each tied to a specific app and keyword. The prompt requires it to use only facts in the data and say so when data is thin.
3. **Delivers:** emails the report through Resend.

## How it's built
- Cloudflare Worker with a weekly cron trigger
- Read-only binding to the ASO tracker's D1 (SQL) database
- Claude API for analysis, Resend for email
- A protected `/run` endpoint for manual test runs

## How I build
I direct AI (Claude) to write the code, then test every result and correct it. Example: the first test run cut the report off mid-sentence. I caught it, raised the length limit, and added a check so a cut-off report is always flagged instead of sent silently.

## Roadmap
- Add sales and subscription data from RevenueCat
- Add App Store review text
- Save each week's report so the agent can check whether last week's recommendations worked
