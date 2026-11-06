import type { PomodoroSession, PomodoroState, PomodoroTask } from "../types";

const STORAGE_KEY = "pomodoro-data";

export const EMPTY_STATE: PomodoroState = {
  targetPerDay: 8,
  focusMinutes: 25,
  restMinutes: 5,
  autoSwitch: true,
  activeTaskId: null,
  tasks: [],
  sessions: []
};

function normalizeFocusedSeconds(raw: unknown, startedAt: Date, endedAt: Date): number | null {
  const numeric = typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const focusedSeconds = Math.max(1, Math.round(numeric));
  const elapsedSeconds = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));

  if (focusedSeconds === 1 && elapsedSeconds > 60) {
    return elapsedSeconds;
  }

  return focusedSeconds;
}

function normalizeTask(raw: unknown): PomodoroTask | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const maybe = raw as Partial<PomodoroTask>;
  if (typeof maybe.id !== "string" || typeof maybe.name !== "string" || typeof maybe.createdAt !== "string") {
    return null;
  }

  const createdAt = new Date(maybe.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  const name = maybe.name.trim();
  if (!name) {
    return null;
  }

  return { id: maybe.id, name, createdAt: createdAt.toISOString() };
}

function normalizeSession(raw: unknown): PomodoroSession | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const maybe = raw as Partial<PomodoroSession>;
  const started = typeof maybe.startedAt === "string" ? new Date(maybe.startedAt) : null;
  const ended = typeof maybe.endedAt === "string" ? new Date(maybe.endedAt) : null;

  if (!started || !ended || Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return null;
  }

  const focusedSeconds = normalizeFocusedSeconds(maybe.focusedSeconds, started, ended);
  if (focusedSeconds === null) {
    return null;
  }

  return {
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    taskId: typeof maybe.taskId === "string" ? maybe.taskId : null,
    focusedSeconds
  };
}

function clampMinutes(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 180) {
    return fallback;
  }
  return Math.round(numeric * 1000) / 1000;
}

function byTime(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

export function normalizeState(raw: unknown): PomodoroState {
  const maybe = (raw && typeof raw === "object" ? raw : {}) as Partial<PomodoroState>;

  const tasks = Array.isArray(maybe.tasks)
    ? maybe.tasks
        .map((task) => normalizeTask(task))
        .filter((task): task is PomodoroTask => task !== null)
        .sort((a, b) => byTime(a.createdAt, b.createdAt))
    : [];
  const taskIds = new Set(tasks.map((task) => task.id));

  const sessions = Array.isArray(maybe.sessions)
    ? maybe.sessions
        .map((s) => normalizeSession(s))
        .filter((s): s is PomodoroSession => s !== null)
        .map((session) => ({ ...session, taskId: session.taskId && taskIds.has(session.taskId) ? session.taskId : null }))
        .sort((a, b) => byTime(a.endedAt, b.endedAt))
    : [];

  return {
    targetPerDay:
      typeof maybe.targetPerDay === "number" && maybe.targetPerDay >= 1
        ? Math.floor(maybe.targetPerDay)
        : EMPTY_STATE.targetPerDay,
    focusMinutes: clampMinutes(maybe.focusMinutes, EMPTY_STATE.focusMinutes),
    restMinutes: clampMinutes(maybe.restMinutes, EMPTY_STATE.restMinutes),
    autoSwitch: typeof maybe.autoSwitch === "boolean" ? maybe.autoSwitch : EMPTY_STATE.autoSwitch,
    activeTaskId: typeof maybe.activeTaskId === "string" && taskIds.has(maybe.activeTaskId) ? maybe.activeTaskId : null,
    tasks,
    sessions
  };
}

function load(): PomodoroState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : { ...EMPTY_STATE };
  } catch {
    return { ...EMPTY_STATE };
  }
}

function save(data: PomodoroState): PomodoroState {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error("Failed to save data to browser storage.");
  }
  return data;
}

function update(mutate: (data: PomodoroState) => void): PomodoroState {
  const data = load();
  mutate(data);
  return save(data);
}

function toIso(value: string, label: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date.toISOString();
}

export async function readState(): Promise<PomodoroState> {
  return load();
}

export async function updateTarget(targetPerDay: number): Promise<PomodoroState> {
  if (!Number.isInteger(targetPerDay) || targetPerDay < 1 || targetPerDay > 100) {
    throw new Error("targetPerDay must be an integer between 1 and 100.");
  }
  return update((data) => {
    data.targetPerDay = targetPerDay;
  });
}

export async function updateDurations(focusMinutes: number, restMinutes: number): Promise<PomodoroState> {
  if (!Number.isFinite(focusMinutes) || focusMinutes <= 0 || focusMinutes > 180) {
    throw new Error("focusMinutes must be a number between 0 and 180.");
  }
  if (!Number.isFinite(restMinutes) || restMinutes <= 0 || restMinutes > 180) {
    throw new Error("restMinutes must be a number between 0 and 180.");
  }
  return update((data) => {
    data.focusMinutes = Math.round(focusMinutes * 1000) / 1000;
    data.restMinutes = Math.round(restMinutes * 1000) / 1000;
  });
}

export async function updateAutoSwitch(autoSwitch: boolean): Promise<PomodoroState> {
  return update((data) => {
    data.autoSwitch = autoSwitch;
  });
}

export async function addTask(name: string): Promise<PomodoroState> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Task name is required.");
  }
  return update((data) => {
    const task: PomodoroTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed.slice(0, 80),
      createdAt: new Date().toISOString()
    };
    data.tasks.push(task);
    if (!data.activeTaskId) {
      data.activeTaskId = task.id;
    }
  });
}

export async function setActiveTask(activeTaskId: string | null): Promise<PomodoroState> {
  return update((data) => {
    if (activeTaskId !== null && !data.tasks.some((task) => task.id === activeTaskId)) {
      throw new Error("Task not found.");
    }
    data.activeTaskId = activeTaskId;
  });
}

export async function removeTask(taskId: string): Promise<PomodoroState> {
  return update((data) => {
    data.tasks = data.tasks.filter((task) => task.id !== taskId);
    if (data.activeTaskId === taskId) {
      data.activeTaskId = null;
    }
    data.sessions = data.sessions.map((session) => (session.taskId === taskId ? { ...session, taskId: null } : session));
  });
}

export async function addSession(
  startedAt: string,
  endedAt: string,
  taskId: string | null,
  focusedSeconds: number
): Promise<PomodoroState> {
  const startedIso = toIso(startedAt, "startedAt");
  const endedIso = toIso(endedAt, "endedAt");

  return update((data) => {
    const normalizedTaskId = taskId && data.tasks.some((task) => task.id === taskId) ? taskId : null;
    const key = `${startedIso}|${endedIso}|${normalizedTaskId ?? "none"}`;
    if (data.sessions.some((s) => `${s.startedAt}|${s.endedAt}|${s.taskId ?? "none"}` === key)) {
      return;
    }

    data.sessions.push({
      startedAt: startedIso,
      endedAt: endedIso,
      taskId: normalizedTaskId,
      focusedSeconds:
        Number.isFinite(focusedSeconds) && focusedSeconds > 0
          ? Math.max(1, Math.round(focusedSeconds))
          : Math.max(1, Math.round((new Date(endedIso).getTime() - new Date(startedIso).getTime()) / 1000))
    });
    data.sessions.sort((a, b) => byTime(a.endedAt, b.endedAt));
  });
}

export async function deleteSession(startedAt: string, endedAt: string): Promise<PomodoroState> {
  return deleteSessions([{ startedAt, endedAt }]);
}

export async function deleteSessions(sessions: Array<{ startedAt: string; endedAt: string }>): Promise<PomodoroState> {
  const keys = new Set(sessions.map((s) => `${toIso(s.startedAt, "startedAt")}|${toIso(s.endedAt, "endedAt")}`));
  return update((data) => {
    data.sessions = data.sessions.filter((session) => !keys.has(`${session.startedAt}|${session.endedAt}`));
  });
}

export async function updateSessionTask(startedAt: string, endedAt: string, taskId: string | null): Promise<PomodoroState> {
  const startedIso = toIso(startedAt, "startedAt");
  const endedIso = toIso(endedAt, "endedAt");

  return update((data) => {
    const session = data.sessions.find((s) => s.startedAt === startedIso && s.endedAt === endedIso);
    if (!session) {
      throw new Error("Session not found.");
    }
    session.taskId = taskId && data.tasks.some((task) => task.id === taskId) ? taskId : null;
  });
}

export function exportData(): string {
  return JSON.stringify(load(), null, 2);
}

export async function importData(text: string): Promise<PomodoroState> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("That file doesn't look like a Pomodoro backup.");
  }
  const raw = parsed as Partial<PomodoroState>;
  if (!Array.isArray(raw.tasks) && !Array.isArray(raw.sessions)) {
    throw new Error("That file doesn't look like a Pomodoro backup.");
  }
  return save(normalizeState(parsed));
}
