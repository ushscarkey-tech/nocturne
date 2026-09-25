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

With no configuration, Nocturne runs in **demo mode**, saved in your browser's local storage. A first
visit opens a short guide (`/welcome`): language, name, Service Time and a first task. Sample tasks
with a week of past journeys can be loaded from the last step or from Settings.

### Cloud accounts (optional)

Without keys, everything stays in the browser. With keys, `/login` offers email/password accounts,
and data syncs across devices. A browser's existing data moves into the account on first sign-in.

**Firebase** (used when its keys are set)

1. Create a Firebase project. In *Authentication*, enable **Email/Password**.
2. Create a *Firestore* database and publish the rules in `firestore.rules`
   (each traveller can read and write only `users/{uid}/…`).
3. In *Authentication → Settings → Authorized domains*, add the site's domain
   (e.g. `<owner>.github.io`).
4. Register a Web app and put its `apiKey`, `authDomain`, `projectId` and `appId` into `.env.local`
   (see `.env.example`), or into the Pages workflow for the deployed site.

Firestore keeps an offline cache, so changes made without a connection are sent later.

**Supabase** (alternative)

1. Run the files in `supabase/migrations/` in order. They create the tables, row level security
   policies and a trigger that creates a profile on sign-up.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### GitHub Pages

Nocturne builds to static files (`output: "export"`), so it can be hosted on GitHub Pages.
`.github/workflows/deploy-pages.yml` builds and deploys on every push to the default branch.
The site is served at `https://<owner>.github.io/<repo>/`; the workflow passes that sub-path to the
build as `NEXT_PUBLIC_BASE_PATH`. To try the export locally:

```bash
NEXT_PUBLIC_BASE_PATH=/nocturne npm run build   # writes ./out
```

Repository settings → Pages → Source must be **GitHub Actions**. Cloud keys for the deployed site
are read from the workflow's `env` (Firebase web config is public by design; access is guarded by
the Firestore rules).

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
  quickadd.ts      Natural-language parser for Quick Add (ko / en / ja / zh)
  learning.ts      Task similarity, estimate calibration, focus pattern (all opt-out)
  messages.ts      Structured Route-change messages, rendered by the i18n layer
  seed.ts          Demo data relative to "now"
src/data/        Repository interface: local storage, Firebase (Firestore) and Supabase
src/state/       Zustand store (persists entity diffs), user actions, auth/bootstrap
src/i18n/        English source strings + Korean, Japanese, Chinese (missing keys fall back to English)
src/audio/       Procedural Web Audio ambience (no audio files) with crossfading presets
src/components/  UI: route line and editor, journey scenes, the 3D platform (three.js), tickets, forms
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
  produces a short "Route updated" explanation: why first, then the one detail that matters.
- **Signals never add work** – Low / Steady / Sharp, Low Focus and resuming service only re-sort
  and re-chunk the work already on tonight's route (Low focus → stations of 30 minutes at most,
  easy and appealing work first; Sharp → important, hard work first). Only an explicit
  "Optimize route", a task change or "keep going" after finishing early pulls new work in.
- **Service Time is respected** – boarding before a window opens waits on the platform (or departs
  early on request), and a station never runs past the end of its window.
- **The night ends at 04:00** – the service day rolls over at 04:00, so windows such as 22:00–01:00
  belong to the evening they start on.
- **Estimates are checked, not trusted** – when a task's planned time runs out, Nocturne asks
  whether it's finished or needs more time instead of silently closing it.
- **Deleting keeps history** – a task with past journeys is archived so tickets stay intact.

### Scenes

The main moments are scenes, not scrolling pages: Tonight (an empty platform, the departure time,
BOARD), the ticket machine (confirm the route, how you feel, a carriage; the ticket prints and you
take it), the carriage door, pulling out, the window (with the Tunnel), station stops with a lit
name board, route changes shown as a signal change on the line, and the final station, where the
night's ticket prints line by line and goes into the Archive's ticket book. Sound effects are
synthesised like the ambience and follow the Effects slider; with Reduce Motion every scene falls
back to a short fade.

### Quick Add and learning

- **Quick Add** (the round button above the tab bar) reads a sentence such as
  "다음 주 화요일까지 생명 3시간 정도, 별로 하기 싫어" into title, deadline, time, interest, difficulty,
  importance, repeat, session size and Line. Nothing is guessed that wasn't said; unclear parts are
  marked *Check* in the preview, and the full form is always one tap away.
- **Similar tasks** are grouped by subject and kind of work read from the title
  ("수학 문제집" ≈ "Math problem set", but not "수학 개념 정리").
- **Estimate calibration** needs at least 3 finished similar tasks (or 6 stations) with consistent
  ratios. It only suggests ("Use 80 min / Keep 60 min"); the traveller's own estimate is kept in
  `user_estimated_minutes` and can be restored.
- **Focus pattern** needs 10 stations over 5 days in the last 4 weeks. It then gives hard work a
  small nudge toward hours where it usually gets finished. Deadlines, workload, locked stations and
  importance always outweigh it; the Route change note says when it moved something.
- All of it can be switched off in Settings → Personalized scheduling; switched off, the planner
  behaves exactly as without history.

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

## Languages

English, 한국어, 日本語 and 中文. The language follows the browser on first visit and can be changed
in the welcome guide or Settings. Korean, Japanese and Chinese use IBM Plex Sans KR / JP,
Noto Sans SC and serif faces (Gowun Batang, Shippori Mincho, Noto Serif SC) for display type.

## Known limits

- A night's service must end by 04:00.
- Reminders are browser notifications while Nocturne is open (no push service yet).
- No calendar sync yet.
