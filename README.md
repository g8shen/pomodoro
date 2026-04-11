# Minimal Pomodoro

A local-first Pomodoro app with a minimal dark interface, task tracking, configurable focus/rest durations, and JSON file persistence.

## Features

- Focus/rest timer loop with customizable durations and optional auto-switch
- Controls for start, pause, reset, and mode switching
- Session history with per-task assignment and deletion
- Daily target management with progress and streak tracking
- Local JSON persistence (no DB, no auth)

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
  "focusMinutes": 25,
  "restMinutes": 5,
  "autoSwitch": true,
  "activeTaskId": null,
  "tasks": [],
  "sessions": []
}
```
