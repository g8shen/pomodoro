# Minimal ASCII Pomodoro

A local-first Pomodoro app with a minimal dark interface, ASCII header styling, 25/5 mode switching, and JSON file persistence.

## Features

- Focus/rest timer loop with customizable durations (default `25:00` focus -> `05:00` rest, auto-switch)
- Controls: start, pause, reset, skip
- Session tracking: increments only after a full focus completion
- Daily target management (pomodoros/day)
- Daily progress view (`completed today / target`) with progress bar
- Local JSON persistence (no DB, no auth)
- Optional completion sound toggle
- Daily streak indicator (consecutive days reaching target)

## Project Structure

- `src/App.tsx`: UI and timer/session logic
- `src/components/ui.tsx`: lightweight shadcn-style UI primitives
- `src/lib/time.ts`: time formatting and streak/day helpers
- `server/index.ts`: local API for reading/writing persisted state
- `data/pomodoro-data.json`: persisted app state

## Data File

- Path: `data/pomodoro-data.json`
- Shape:
  - `targetPerDay: number`
  - `sessions: string[]` (ISO timestamps)

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start web + API dev servers:

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

## Reset Data

Edit or clear `data/pomodoro-data.json`, for example:

```json
{
  "targetPerDay": 8,
  "sessions": []
}
```
