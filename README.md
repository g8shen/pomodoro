# Minimal Pomodoro

A local-first Pomodoro app with a minimal dark interface, task tracking, configurable focus/rest durations, and browser `localStorage` persistence. Fully static — deployable to Vercel or any static host.

## Features

- Focus/rest timer loop with customizable durations and optional auto-switch
- Controls for start, pause, reset, and mode switching
- Session history with per-task assignment and deletion
- Daily target management with progress and streak tracking
- Local persistence in the browser (no server, no DB, no auth)

## Project Structure

- `src/App.tsx`: UI and timer/session logic
- `src/components/ui.tsx`: lightweight shadcn-style UI primitives
- `src/lib/time.ts`: time formatting and streak/day helpers
- `src/lib/storage.ts`: reads/writes app state to `localStorage`

## Data

- Stored in `localStorage` under the key `pomodoro-data` (per browser, per domain)
- Shape:
  - `targetPerDay: number`
  - `focusMinutes: number`
  - `restMinutes: number`
  - `autoSwitch: boolean`
  - `activeTaskId: string | null`
  - `tasks: { id: string; name: string; createdAt: string }[]`
  - `sessions: { startedAt: string; endedAt: string; taskId: string | null; focusedSeconds: number }[]`

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open:

- `http://localhost:5173`

## Build

```bash
npm run build
npm run preview
```

## Deploy (Vercel)

```bash
npm i -g vercel
vercel        # preview
vercel --prod # production
```

## Reset Data

In the browser devtools console:

```js
localStorage.removeItem("pomodoro-data")
```
