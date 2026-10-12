// Portfolio Pulse: a weekly AI agent for the Apps That Help portfolio.
// 1. Gathers data (keyword rankings and App Store ratings from the aso-tracker database)
// 2. Asks Claude to find what changed and recommend actions
// 3. Emails the report

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  RUN_TOKEN: string;
}

const FROM = 'Portfolio Pulse <pulse@appsthathelp.com>';
const TO = 'appsthathelphq@gmail.com';
const MODEL = 'claude-sonnet-5';

type RankRow = { app: string; keyword: string; store: string; now: number | null; week_ago: number | null };
type RatingRow = { app: string; rating: number | null; rating_count: number | null; updated_at: string };

async function gatherData(env: Env) {
  const ranks = await env.DB.prepare(
    `SELECT a.name AS app, k.keyword, k.store,
       (SELECT s.position FROM snapshots s
         WHERE s.keyword_id = k.id AND s.source = 'cron'
         ORDER BY s.checked_at DESC LIMIT 1) AS now,
       (SELECT s.position FROM snapshots s
         WHERE s.keyword_id = k.id AND s.source = 'cron' AND s.checked_at <= datetime('now', '-7 days')
         ORDER BY s.checked_at DESC LIMIT 1) AS week_ago
     FROM keywords k JOIN apps a ON a.id = k.app_id
     WHERE k.active = 1 AND k.app_id IS NOT NULL
     ORDER BY a.name, k.store, k.keyword`
  ).all<RankRow>();

  const ratings = await env.DB.prepare(
    `SELECT a.name AS app, sa.rating, sa.rating_count, sa.updated_at
     FROM apps a JOIN serp_apps sa ON sa.store = 'ios' AND sa.store_app_id = a.apple_id
     ORDER BY a.name`
  ).all<RatingRow>();

  return { rankings: ranks.results, ratings: ratings.results };
}

async function askClaude(env: Env, data: unknown): Promise<string> {
  const prompt = `You are the weekly analyst for Apps That Help, a portfolio of iOS and Android apps.
Below is this week's data as JSON. "now" and "week_ago" are App Store or Play Store search positions (1 is best; null means not ranked in the top 200).

Write a short weekly report in simple HTML (h2, p, ul, li, b only):
1. A one-sentence headline of the week.
2. Biggest wins: keywords that improved most.
3. Biggest drops: keywords that fell most or dropped out.
4. Ratings: anything notable.
5. Up to 3 recommended actions, each tied to a specific app and keyword.
Rules: use only facts in the data, never guess; if the data is thin, say so. Never use em dashes.

DATA:
${JSON.stringify(data)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: { type: string; text?: string }[]; stop_reason?: string };
  const text = json.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  // Safety check: never send a report that was cut off mid-sentence without saying so
  if (json.stop_reason === 'max_tokens') {
    return text + '<p><b>Note:</b> this report was cut off because it hit the length limit.</p>';
  }
  return text;
}

async function sendEmail(env: Env, html: string) {
  const date = new Date().toISOString().slice(0, 10);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: TO, subject: `Portfolio Pulse: week of ${date}`, html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

async function runPulse(env: Env): Promise<string> {
  const data = await gatherData(env);
  const report = await askClaude(env, data);
  await sendEmail(env, report);
  return report;
}

export default {
  // Runs automatically every Monday (see wrangler.toml)
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runPulse(env));
  },

  // Manual test run: GET /run with header Authorization: Bearer <RUN_TOKEN>
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/run') return new Response('Portfolio Pulse', { status: 200 });
    if (req.headers.get('Authorization') !== `Bearer ${env.RUN_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    try {
      const report = await runPulse(env);
      return new Response(report, { headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }
  },
};
