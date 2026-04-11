import type { PomodoroSession } from "../types";

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

export function isSessionToday(session: PomodoroSession): boolean {
  const date = new Date(session.endedAt);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function calculateStreak(sessions: PomodoroSession[], targetPerDay: number): number {
  if (targetPerDay < 1) {
    return 0;
  }

  const countsByDay = new Map<string, number>();

  for (const session of sessions) {
    const day = new Date(session.endedAt).toISOString().slice(0, 10);
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
  }

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const dayKey = cursor.toISOString().slice(0, 10);
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
