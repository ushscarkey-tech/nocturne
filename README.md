# Nocturne

**A planner that doesn't break when your plan does.**

Nocturne is an adaptive Todo and study planner. It spreads long tasks across the days before their
deadlines, builds tonight's route inside your available study time, and quietly re-plans the rest of
the evening when you start late, finish early, need more time or lose focus. The whole experience
lives inside a late-night train journey: Route, Stations, Boarding, the Tunnel, Station Stops and a
Ticket at the Final Station.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

With no configuration, Nocturne runs in **demo mode**: a sample traveller with tasks, two Lines,
weekday Service Time and a week of past journeys, saved in your browser's local storage.

### Cloud accounts (Supabase)

1. Create a Supabase project and run `supabase/migrations/20260925000000_init.sql`
   (via `supabase db push` or the SQL editor). It creates the tables, row level security policies
   and a trigger that creates a profile on sign-up.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable (anon) key.
3. Restart the dev server. `/login` now offers email/password sign-up and sign-in; "Explore the
   demo" remains available.

### GitHub Pages

Nocturne builds to static files (`output: "export"`), so it can be hosted on GitHub Pages.
`.github/workflows/deploy-pages.yml` builds and deploys on every push to the default branch.
The site is served at `https://<owner>.github.io/<repo>/`; the workflow passes that sub-path to the
build as `NEXT_PUBLIC_BASE_PATH`. To try the export locally:

```bash
NEXT_PUBLIC_BASE_PATH=/nocturne npm run build   # writes ./out
```

Repository settings → Pages → Source must be **GitHub Actions**. To turn on cloud accounts in the
deployed site, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as
repository secrets.

### Checks

```bash
npm run test         # planner + journey engine (vitest)
npm run typecheck
npm run lint
npm run build
```

## Architecture

```
src/core/        Framework-free domain logic (reusable by a future React Native / Expo app)
  types.ts         Task, StudyWindow, StudySession, Line, Journey, Ticket
  availability.ts  Service Time: weekly windows, one-off additions, blocked exceptions
  allocate.ts      Long-term allocation across days + feasibility (Route conflict)
  route.ts         Focus-aware ordering and packing of stations into windows
  planner.ts       planToday(): rebuild or retime tonight; explains every Route change
  journey.ts       Journey engine: board, arrive, low focus, finish early, more time,
                   stops, service pause, end, ticket
  stats.ts         Journey summaries, ticket faces, archive statistics
  seed.ts          Demo data relative to "now"
src/data/        Repository interface, local-storage and Supabase implementations
src/state/       Zustand store (persists entity diffs), user actions, auth/bootstrap
src/audio/       Procedural Web Audio ambience (no audio files) with crossfading presets
src/components/  UI: route line and editor, journey scenes, tickets, forms
src/app/         Next.js App Router pages
supabase/        SQL migrations
```

### How planning works

- **Allocation** – tasks are processed earliest-deadline-first and water-filled across the days
  before their deadline, preferring the least loaded day with a slight bias toward earlier days.
  The deadline day is kept as a buffer and used only when needed. Recurring tasks reserve their
  occurrences first; Someday tasks only use spare capacity in the coming week.
- **Feasibility** – an EDF cumulative check compares required work with available focus time up to
  each deadline. A shortfall surfaces as a *Route conflict* with concrete options instead of an
  impossible plan.
- **Tonight's route** – the day's allocation is split into stations (respecting min/max session
  length) and ordered greedily by urgency, importance and how well the task's demand (difficulty,
  reluctance) matches the traveller's focus, avoiding back-to-back long hard stations. Stops are
  inserted between stations.
- **Adaptation** – every change rebuilds or retimes **only future, unlocked stations**. Completed
  and partial stations, the active station and locked stations never move. Each adjustment
  produces a plain-language "Route updated" explanation.

### Terminology

| Product concept | Nocturne |
|---|---|
| Today's schedule | Route |
| Task session | Station |
| Available study time | Service Time |
| Deep focus | Tunnel |
| Break | Station Stop |
| Rescheduling | Route Adjustment |
| End of day | Final Station |
| Daily record | Ticket |
| Long-term project | Line |

## Known limits of v1

- Service windows can't cross midnight.
- Reminders are browser notifications while Nocturne is open (no push service yet).
- Natural-language quick add, calendar sync and learned focus patterns are planned for later.
