# Bluff Club — live Next.js hackathon app

A host opens a room, friends join on their phones, humans and one real AI submit entries, players vote, and the server reveals authors and scores. Five selectable rounds. Original purple gameshow design retained.

## Run

Requires Node 22+.

```sh
npm install
cp .env.example .env.local
# Edit .env.local and set OPENAI_API_KEY. Never commit it.
npm run dev
```

Host at http://localhost:3000. Phones must use your laptop's LAN IP, e.g. http://192.168.1.42:3000, on the same Wi-Fi. Venue client isolation may prevent this; use a public Node host or a hotspot if necessary. The host is a spectator; join on a separate phone/browser tab to play. Sessions survive page reloads via sessionStorage. Open tabs independently instead of duplicating a tab to avoid copying a player's session.

## Production / hackathon deployment

```sh
npm ci
npm run build
npm start
```

Deploy this folder to a single persistent Node service on Railway, Render, Fly or a VM, with the start command above. Set OPENAI_API_KEY and optionally HOST_PASSWORD in that service's environment. The included Dockerfile is another option. PORT is read by Next.js. Keep one instance, no autoscaling; do not deploy this in-memory version to Vercel serverless or the old static Sites URL. Server restarts lose all rooms. No database is required for a single-process demo.

The existing Sites page remains the earlier simulated prototype; this is a separate real application. Publishing a live Node service requires a hosting account/environment.

## Environment

- OPENAI_API_KEY: server only, never NEXT_PUBLIC.
- OPENAI_TEXT_MODEL: defaults to gpt-6-astra; choose a model available to your project.
- OPENAI_IMAGE_MODEL: defaults to gpt-image-2.5-sunburst.
- HOST_PASSWORD: optional password required to create rooms; set for a public demo to limit credit use.
- DEMO_MODE=true: explicit offline development mode. Clearly shown in the UI. Uses canned AI entries and keyword judging. Default false. No silent fallback from failed live requests.

Model names and request patterns checked against official documentation. Account access must be confirmed with your key. The Decisions API uses gpt-6-luna.

## Rounds / AI use

1. Human or Hallucination: an explicitly fictional museum question. AI invents a bluff. Decisions rejects a human bluff that means the true answer. Truth votes earn 1,000; successful bluffs earn 500 per vote.
2. Who Drew That: humans draw on phones; the Images API creates a rough drawing for AI. Find AI for 1,000; wrongly accusing a human gives them 500 and gives AI 500.
3. Caption Trap: caption the pre-generated pigeon image; a live text model writes the AI caption. Same AI detection scoring.
4. Pitch, Please: write a product pitch; AI competes. Every human vote gives the author 500. No fake opponent votes.
5. Prompt Gone Wrong: guess the intended prompt. By default uses the pre-generated tiger-prawn-soup puzzle for fast start. Check “fresh image” to generate a new staged misunderstanding from a small curated bank. Responses semantically judges guesses from 0–100; points = score × 10 plus 500 to every highest-scoring guess (if above zero).

Host chooses when to close submissions/voting. The displayed timer is advisory. Pending validation requests block closing submissions. Partial rounds may close with absent players. Failed AI requests show an error and offer retry/skip; no points are silently invented. Generation currently happens before the drawing timer starts, to make the hackathon flow reliable.

## Architecture

Next.js App Router + React + TypeScript. One /api/game handler owns authoritative in-memory room state. Polling every 1.2 seconds. Random room codes, per-host and per-player secret tokens. Server validates phase, duplicate submissions/votes, own-entry voting, lengths and host controls. Authors/answers are not sent before reveal. No real-time database, auth provider or WebSocket service. No automated tests per hackathon request; use the production build and a manual host/player walkthrough.

## Credits / Codex

Original code, UI, CSS mascots and generated assets built with Codex during the London hackathon chat. Social bluffing inspiration; no Jackbox code, assets or branding. Google Fonts: DM Sans, Space Grotesk, Archivo Black (system fallback). Pre-generated pigeon drawings and mystery bowl created with built-in image generation. The soup image was deliberately constructed as a misunderstanding, not claimed as a real accidental failure. Legacy asset prompts are in IMAGE-PROMPTS.md.

Concrete Codex contribution: migrated the simulated browser-only prototype into an authoritative multiplayer state machine, implemented server-side API adapters, hid entry ownership until reveal, and added actual vote-based scoring.

## Limits

Hackathon prototype, not production infrastructure. Rooms live for 3 hours of inactivity, max 30 rooms / 8 players each. No persistence, distributed coordination, sophisticated moderation, anti-cheat or per-IP rate limits. Set HOST_PASSWORD before public hosting. API calls cost money. Names, submissions and drawings are sent to OpenAI only where needed (bluff validation / AI prompt judging; drawing prompts, not human strokes). Use fictional nicknames and do not enter sensitive information. No 3D or voice integration yet.

## Official references

- https://nextjs.org/docs/app/getting-started/installation
- https://developers.openai.com/api/docs/guides/text
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/guides/decisions
