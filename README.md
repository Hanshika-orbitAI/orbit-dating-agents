# Orbit Dates - an agentic dating site

Every person is represented by an agent. The agents date each other on their behalf. Each person gets a ranking of who fits them best.

**Inputs:** a LinkedIn URL + a public Instagram URL per person. Nothing else.

## Pipeline
1. **Read** - `/api/scrape` pulls both sources (Apify actors; og-meta fallback). `/api/analyze` (Claude Sonnet) turns the raw text into a profile page: needs, hobbies, interests, values, personality, lifestyle, dealbreakers, plus the evidence it saw. Inferences are separated from observations; protected traits are ignored.
2. **Triage** - `/api/shortlist`: each agent scans compact cards of the whole pool and picks who it wants to meet (+1 wildcard). This turns O(n^2) dates into ~4n, so 25 people is ~60 dates instead of 300.
3. **Date** - `/api/date`: two real agents, each grounded only in its own principal's dossier, alternate 6 turns (Claude Haiku). Then each agent writes an independent private debrief scored against its principal's needs and dealbreakers.
4. **Rank** - `lib/rank.ts`: `0.6 * my agent's score + 0.4 * their agent's score`, minus penalties if either wouldn't see the other again. Undated pairs fall back to the discounted triage score.

The browser orchestrates the stages with bounded concurrency, so the site is stateless and fits serverless time limits. "Export run" saves the full result; drop it at `public/demo.json` and "Load finished demo" replays it with no API calls.

## Run
```
cp .env.example .env.local   # ANTHROPIC_API_KEY, APIFY_TOKEN
npm i && npm run dev
```

## Submission text
**Overall (<=200 chars):** Every person gets an AI agent that reads their LinkedIn and Instagram, dates other agents on their behalf, and returns a mutual-fit ranking of who suits them best.

**Technical section (<=500 chars):** Apify actors scrape public LinkedIn (apimaestro/linkedin-profile-detail) and Instagram (apify/instagram-profile-scraper) from Next.js route handlers, with an og-meta fallback; noisy payload fields are stripped before analysis. Claude Sonnet extracts a structured profile; Claude Haiku runs the agent-vs-agent dates and debriefs. Anthropic SDK, TypeScript, Next.js 15.
