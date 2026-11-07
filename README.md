# Ruby vs Sapphire

React + Vite frontend, Python FastAPI backend, and Supabase PostgreSQL/Auth/Storage. Designed for a small hackathon deployment on Vercel Hobby and Supabase Free.

## First-time setup

1. Create or choose a Supabase project. Run `supabase/migrations/001_game.sql` **once** in its SQL editor, then optionally run `supabase/seed.sql`. The seed creates one event starting an hour later. It contains no fake players.
2. Copy `.env.example` to `.env` in this directory. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (a publishable or legacy anon key). No database password or service-role key is needed. The public key is intentionally delivered to the browser; authorization is enforced by Supabase policies/functions.
3. Configure Supabase Auth email/password sign-in. For a hackathon, create confirmed test accounts in the Supabase Auth dashboard, or configure custom SMTP for real confirmation emails. Supabase's default mail service is restricted and is not a general-purpose signup mailer. If you turn confirmation off for a closed demo, users can sign in immediately, but email addresses are not verified. Never use real passwords for throwaway demo accounts. Set Auth's Site URL to the frontend URL.
4. Install dependencies:

```sh
uv sync
npm --prefix ruby-sapphire-prototype install --legacy-peer-deps
```

Python 3.12 or newer is required. Python dependencies are managed exclusively with uv and `pyproject.toml`. Use `uv add <package>` or `uv add --dev <package>` for changes.

The installed uv 0.9.26 crashes inside this workspace's macOS sandbox before dependency resolution. A validated `uv.lock` could not be generated here. Run `uv lock` or `uv sync` in your normal terminal and commit the resulting lockfile. If the same crash occurs, update uv with `uv self update` first. No requirements files are used.

## Development

From this directory:

```sh
npm run dev
```

This starts FastAPI at `http://127.0.0.1:8000` and Vite at its printed localhost URL (normally `http://localhost:5173`). Vite proxies `/api` to Python. Open the **Vite** URL. Stop both with Ctrl+C.

Separate commands are also available:

```sh
npm run dev:backend
npm run dev:frontend
```

API documentation: `http://127.0.0.1:8000/docs`.

## Play a real test game

- Open two separate browser profiles (or normal and private windows) and sign in with different accounts.
- Join the same future event. Assignments are random on ties, otherwise the smaller team gets the next player. Repeated joins keep the existing assignment. Teams cap at 10; registration closes at start time.
- Reload and use **Open game** or **My game** to return to your saved membership. Multiple event registrations are supported.
- Send a team message. Opponents must not see it.
- To start a test event, edit its `starts_at` value in the Supabase dashboard to a time in the past **after both players have joined**. There is no player-accessible override.
- Tasks become visible on the next refresh, based on the server's clock. The raw API also withholds their text before start.
- Upload photos to complete tasks. Photos are decoded and resized to JPEG in the browser, limited to 2 MB by storage, and uploaded straight to a private bucket. The Python endpoint records completion only after the object exists.
- The first team to complete every task wins. All players viewing the event receive the winner/meetup banner on the next refresh; remaining submissions are blocked. This is an in-app alert, not an OS push notification.

## Backend layout

- `backend/main.py`: FastAPI routes, Supabase identity verification, input validation, and upload preparation.
- `supabase/migrations/001_game.sql`: tables, transactional game rules, permissions, and private storage policies.
- `ruby-sapphire-prototype/src/api.js`: browser authentication/session refresh, API calls, and image uploads.
- `ruby-sapphire-prototype/src/main.jsx`: connected game screens.

FastAPI forwards the player's JWT to Supabase, keeping its permissions intact. Critical mutations are database functions so concurrent requests and direct API calls cannot bypass balancing, capacity, start-time, team privacy, or winner rules. Event row locks serialize joins and completions. Clients cannot directly write memberships, task completions, or results.

Chat and event state refresh every 5 seconds; game discovery refreshes every 15 seconds. Supabase Realtime subscriptions are not implemented yet. Keep the game page open for alerts. Polling costs and photo storage count against the free quotas.

Create/edit games and tasks through the Supabase dashboard for now. Keep tasks fixed after an event opens for registration. An organizer UI, password reset, leaving games, background push notifications, photo cleanup, and moderation are not included. Failed/racing submissions can leave unreferenced objects in the evidence bucket; remove those after the hackathon through the Storage dashboard. Do not delete referenced evidence during a live game.

## Checks

```sh
uv run pytest
npm run build
```

The Python tests use mocked Supabase responses to verify authentication, validation, token forwarding, upload eligibility, and error handling. They do not prove deployed Supabase policies. Run `supabase/checks.sql` in your project's SQL editor after the migration: it exercises actual database rules with temporary fixtures and rolls back. Use an isolated development project for this check. Its fixtures must not already exist.

Current verification: React production build and 17 Python API tests passed. Because uv crashes in this sandbox, the Python tests were executed with an existing compatible interpreter and cached dependencies. Database checks, browser end-to-end tests, real Supabase connectivity, and Vercel deployment still require verification outside this sandbox.

## Vercel (free Hobby deployment)

Use this entire directory as the Vercel project root, not only `ruby-sapphire-prototype/`. `app.py` exports FastAPI and `pyproject.toml` declares the entrypoint and Python dependencies. `vercel.json` builds React. FastAPI serves the index and mounts built assets; Vercel supports promoting those assets to its CDN.

1. Push this directory to your own Git repository, including the generated `uv.lock` but excluding `.env`, virtual environments, and node_modules.
2. Import it into Vercel, using FastAPI framework detection and the repository's build command.
3. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to Vercel environment variables.
4. Deploy; update Supabase Auth's Site URL to the deployed address and test with two browser profiles.

No background server process, filesystem writes, WebSocket server, paid plan, or custom domain is required. Vercel Hobby is for personal/noncommercial projects; free hosting remains subject to usage limits. Photos go directly to Supabase so they do not pass through Vercel function payload limits.
