import type { PomodoroSession } from "../types";

function localDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function minutesToSeconds(minutes: number): number {
  return Math.max(1, Math.round(minutes * 60));
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatMinutesForDisplay(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function isSessionToday(session: PomodoroSession): boolean {
  return localDayKey(session.endedAt) === localDayKey(new Date());
}

export function calculateStreak(sessions: PomodoroSession[], targetPerDay: number): number {
  if (targetPerDay < 1) {
    return 0;
  }

  const countsByDay = new Map<string, number>();

  for (const session of sessions) {
    const day = localDayKey(session.endedAt);
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
  }

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  if ((countsByDay.get(localDayKey(cursor)) ?? 0) < targetPerDay) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const dayKey = localDayKey(cursor);
    const count = countsByDay.get(dayKey) ?? 0;
    if (count >= targetPerDay) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
