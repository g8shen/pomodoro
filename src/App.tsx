import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input, Progress } from "./components/ui";
import { calculateStreak, formatTime, isSessionToday, minutesToSeconds } from "./lib/time";
import type { Mode, PomodoroSession, PomodoroState, PomodoroTask } from "./types";

const EMPTY_STATE: PomodoroState = {
  targetPerDay: 8,
  focusMinutes: 25,
  restMinutes: 5,
  autoSwitch: true,
  activeTaskId: null,
  tasks: [],
  sessions: []
};

type SummaryRange = "day" | "week" | "month" | "all";

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

  return {
    id: maybe.id,
    name,
    createdAt: createdAt.toISOString()
  };
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

  if (!Number.isFinite(maybe.focusedSeconds) || (maybe.focusedSeconds as number) <= 0) {
    return null;
  }

  return {
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    taskId: typeof maybe.taskId === "string" ? maybe.taskId : null,
    focusedSeconds: Math.max(1, Math.round(maybe.focusedSeconds as number))
  };
}

function normalizeState(raw: unknown): PomodoroState {
  const maybe = raw as Partial<PomodoroState>;
  const tasks = Array.isArray(maybe?.tasks)
    ? maybe.tasks.map((task) => normalizeTask(task)).filter((task): task is PomodoroTask => task !== null)
    : [];
  const taskIds = new Set(tasks.map((task) => task.id));

  const sessions = Array.isArray(maybe?.sessions)
    ? maybe.sessions
        .map((s) => normalizeSession(s))
        .filter((s): s is PomodoroSession => s !== null)
        .map((session) => ({ ...session, taskId: session.taskId && taskIds.has(session.taskId) ? session.taskId : null }))
    : [];

  const targetPerDay = Number.isInteger(maybe?.targetPerDay) && (maybe?.targetPerDay ?? 0) > 0 ? (maybe.targetPerDay as number) : EMPTY_STATE.targetPerDay;
  const focusMinutes = Number.isFinite(maybe?.focusMinutes) && (maybe?.focusMinutes ?? 0) > 0 ? (maybe.focusMinutes as number) : EMPTY_STATE.focusMinutes;
  const restMinutes = Number.isFinite(maybe?.restMinutes) && (maybe?.restMinutes ?? 0) > 0 ? (maybe.restMinutes as number) : EMPTY_STATE.restMinutes;
  const autoSwitch = typeof maybe?.autoSwitch === "boolean" ? maybe.autoSwitch : EMPTY_STATE.autoSwitch;
  const activeTaskId = typeof maybe?.activeTaskId === "string" && taskIds.has(maybe.activeTaskId) ? maybe.activeTaskId : null;

  return { targetPerDay, focusMinutes, restMinutes, autoSwitch, activeTaskId, tasks, sessions };
}

async function parseResponse(res: Response): Promise<PomodoroState> {
  const body = (await res.json().catch(() => null)) as { error?: string } | unknown;
  if (!res.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Request failed.";
    throw new Error(message);
  }
  return normalizeState(body);
}

async function readState(): Promise<PomodoroState> {
  const res = await fetch("/api/state");
  return parseResponse(res);
}

async function updateTarget(targetPerDay: number): Promise<PomodoroState> {
  const res = await fetch("/api/target", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetPerDay })
  });
  return parseResponse(res);
}

async function updateDurations(focusMinutes: number, restMinutes: number): Promise<PomodoroState> {
  const res = await fetch("/api/durations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ focusMinutes, restMinutes })
  });
  return parseResponse(res);
}

async function addTask(name: string): Promise<PomodoroState> {
  const res = await fetch("/api/task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return parseResponse(res);
}

async function setActiveTask(activeTaskId: string | null): Promise<PomodoroState> {
  const res = await fetch("/api/task/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activeTaskId })
  });
  return parseResponse(res);
}

async function removeTask(taskId: string): Promise<PomodoroState> {
  const res = await fetch("/api/task/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId })
  });
  return parseResponse(res);
}

async function addSession(
  startedAt: string,
  endedAt: string,
  taskId: string | null,
  focusedSeconds: number
): Promise<PomodoroState> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startedAt, endedAt, taskId, focusedSeconds })
  });
  return parseResponse(res);
}

async function deleteSession(startedAt: string, endedAt: string): Promise<PomodoroState> {
  const res = await fetch("/api/session/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startedAt, endedAt })
  });
  return parseResponse(res);
}

async function updateSessionTask(
  startedAt: string,
  endedAt: string,
  taskId: string | null
): Promise<PomodoroState> {
  const res = await fetch("/api/session/task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startedAt, endedAt, taskId })
  });
  return parseResponse(res);
}

async function updateAutoSwitch(autoSwitch: boolean): Promise<PomodoroState> {
  const res = await fetch("/api/auto-switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autoSwitch })
  });
  return parseResponse(res);
}

function durationFor(mode: Mode, appState: PomodoroState): number {
  return mode === "focus" ? minutesToSeconds(appState.focusMinutes) : minutesToSeconds(appState.restMinutes);
}

function formatSessionStamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function focusedMinutes(session: PomodoroSession): number {
  return Math.max(0, Math.round(session.focusedSeconds / 60));
}

function formatSessionDuration(session: PomodoroSession): string {
  return `${focusedMinutes(session)}m`;
}

function colorForTaskId(taskId: string): string {
  const palette = [
    "#22d3ee",
    "#fb7185",
    "#a78bfa",
    "#fbbf24",
    "#34d399",
    "#60a5fa",
    "#f97316",
    "#f472b6"
  ];

  let hash = 0;
  for (let i = 0; i < taskId.length; i += 1) {
    hash = (hash * 31 + taskId.charCodeAt(i)) >>> 0;
  }

  return palette[hash % palette.length];
}

function rangeStart(range: SummaryRange): number {
  if (range === "all") {
    return Number.NEGATIVE_INFINITY;
  }

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "week") {
    const day = start.getDay();
    const offset = (day + 6) % 7;
    start.setDate(start.getDate() - offset);
  }

  if (range === "month") {
    start.setDate(1);
  }

  return start.getTime();
}

export default function App() {
  const [state, setState] = useState<PomodoroState>(EMPTY_STATE);
  const [mode, setMode] = useState<Mode>("focus");
  const [remainingSeconds, setRemainingSeconds] = useState(minutesToSeconds(EMPTY_STATE.focusMinutes));
  const [isRunning, setIsRunning] = useState(false);
  const [targetInput, setTargetInput] = useState("8");
  const [focusInput, setFocusInput] = useState("25");
  const [restInput, setRestInput] = useState("5");
  const [taskInput, setTaskInput] = useState("");
  const [summaryRange, setSummaryRange] = useState<SummaryRange>("week");
  const [error, setError] = useState<string | null>(null);

  const completingRef = useRef(false);
  const focusStartedAtRef = useRef<string | null>(null);
  const sessionTaskIdRef = useRef<string | null>(null);
  const sessionFocusedSecondsRef = useRef<number | null>(null);

  useEffect(() => {
    readState()
      .then((data) => {
        setState(data);
        setTargetInput(String(data.targetPerDay));
        setFocusInput(String(data.focusMinutes));
        setRestInput(String(data.restMinutes));
        setRemainingSeconds(durationFor("focus", data));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      window.clearInterval(id);
    };
  }, [isRunning]);

  useEffect(() => {
    document.title = formatTime(remainingSeconds);
    return () => {
      document.title = "Minimal Pomodoro";
    };
  }, [remainingSeconds]);

  useEffect(() => {
    if (!isRunning || remainingSeconds > 0 || completingRef.current) {
      return;
    }

    completingRef.current = true;

    const runCompletion = async () => {
      try {
        if (mode === "focus") {
          const endedAt = new Date().toISOString();
          const startedAt = focusStartedAtRef.current;
          const taskId = sessionTaskIdRef.current;
          const focusedSeconds = sessionFocusedSecondsRef.current ?? durationFor("focus", state);
          if (startedAt) {
            const next = await addSession(startedAt, endedAt, taskId, focusedSeconds);
            setState(next);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to complete timer.");
      } finally {
        if (state.autoSwitch) {
          const nextMode: Mode = mode === "focus" ? "rest" : "focus";
          setMode(nextMode);
          setRemainingSeconds(durationFor(nextMode, state));
          if (nextMode === "focus") {
            focusStartedAtRef.current = null;
            sessionTaskIdRef.current = null;
            sessionFocusedSecondsRef.current = null;
          }
        } else {
          setIsRunning(false);
          setRemainingSeconds(0);
          if (mode === "focus") {
            focusStartedAtRef.current = null;
            sessionTaskIdRef.current = null;
            sessionFocusedSecondsRef.current = null;
          }
        }
        completingRef.current = false;
      }
    };

    void runCompletion();
  }, [isRunning, mode, remainingSeconds, state]);

  const taskById = useMemo(() => new Map(state.tasks.map((task) => [task.id, task])), [state.tasks]);
  const activeTask = state.activeTaskId ? taskById.get(state.activeTaskId) ?? null : null;

  const completedToday = useMemo(() => state.sessions.filter(isSessionToday).length, [state.sessions]);
  const progressRatio = useMemo(() => {
    if (state.targetPerDay < 1) {
      return 0;
    }
    return Math.min(1, completedToday / state.targetPerDay);
  }, [completedToday, state.targetPerDay]);

  const streak = useMemo(() => calculateStreak(state.sessions, state.targetPerDay), [state.sessions, state.targetPerDay]);
  const modeLabel = mode === "focus" ? "FOCUS" : "REST";
  const isRestMode = mode === "rest";
  const modeToggleLabel = isRestMode ? "Switch to Focus" : "Switch to Rest";

  const recentSessions = useMemo(
    () => [...state.sessions].sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()).slice(0, 12),
    [state.sessions]
  );

  const totalFocusedMinutes = useMemo(() => {
    return state.sessions.reduce((sum, session) => sum + focusedMinutes(session), 0);
  }, [state.sessions]);

  const summaryRows = useMemo(() => {
    const start = rangeStart(summaryRange);
    const totals = new Map<string, number>();

    for (const session of state.sessions) {
      const ended = new Date(session.endedAt).getTime();
      if (!Number.isFinite(ended) || ended < start) {
        continue;
      }

      const key = session.taskId ?? "__unassigned__";
      totals.set(key, (totals.get(key) ?? 0) + focusedMinutes(session));
    }

    return [...totals.entries()]
      .map(([key, minutes]) => {
        if (key === "__unassigned__") {
          return { id: key, name: "Unassigned", minutes, color: "#71717a" };
        }
        const task = taskById.get(key);
        return {
          id: key,
          name: task ? task.name : "Deleted Task",
          minutes,
          color: colorForTaskId(key)
        };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [state.sessions, summaryRange, taskById]);

  function start() {
    setError(null);
    if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
      setRemainingSeconds(durationFor(mode, state));
    }

    if (mode === "focus" && !focusStartedAtRef.current) {
      focusStartedAtRef.current = new Date().toISOString();
      sessionTaskIdRef.current = state.activeTaskId;
      sessionFocusedSecondsRef.current = Math.max(1, remainingSeconds);
    }

    setIsRunning(true);
  }

  function pause() {
    setIsRunning(false);
  }

  function reset() {
    setIsRunning(false);
    setRemainingSeconds(durationFor(mode, state));
    if (mode === "focus") {
      focusStartedAtRef.current = null;
      sessionTaskIdRef.current = null;
      sessionFocusedSecondsRef.current = null;
    }
  }

  function toggleMode() {
    setIsRunning(false);
    const nextMode: Mode = mode === "focus" ? "rest" : "focus";
    setMode(nextMode);
    setRemainingSeconds(durationFor(nextMode, state));
    if (mode === "focus") {
      focusStartedAtRef.current = null;
      sessionTaskIdRef.current = null;
      sessionFocusedSecondsRef.current = null;
    }
  }

  async function saveTarget() {
    setError(null);
    const parsed = Number(targetInput);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      setError("Target must be an integer between 1 and 100.");
      return;
    }

    try {
      const next = await updateTarget(parsed);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save target.");
    }
  }

  async function saveDurations() {
    setError(null);
    const focusMinutes = Number(focusInput);
    const restMinutes = Number(restInput);

    if (!Number.isFinite(focusMinutes) || focusMinutes <= 0 || focusMinutes > 180) {
      setError("Focus duration must be a number between 0 and 180.");
      return;
    }

    if (!Number.isFinite(restMinutes) || restMinutes <= 0 || restMinutes > 180) {
      setError("Rest duration must be a number between 0 and 180.");
      return;
    }

    try {
      const next = await updateDurations(focusMinutes, restMinutes);
      setState(next);
      setIsRunning(false);
      setRemainingSeconds(durationFor(mode, next));
      if (mode === "focus") {
        focusStartedAtRef.current = null;
        sessionTaskIdRef.current = null;
        sessionFocusedSecondsRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save durations.");
    }
  }

  async function createTask() {
    setError(null);
    const name = taskInput.trim();
    if (!name) {
      setError("Task name is required.");
      return;
    }

    try {
      const next = await addTask(name);
      setState(next);
      setTaskInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task.");
    }
  }

  async function selectActiveTask(taskId: string | null) {
    setError(null);
    try {
      const next = await setActiveTask(taskId);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set active task.");
    }
  }

  async function deleteTaskItem(task: PomodoroTask) {
    setError(null);
    if (!window.confirm(`Delete task \"${task.name}\"?`)) {
      return;
    }

    try {
      const next = await removeTask(task.id);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete task.");
    }
  }

  async function removeSession(session: PomodoroSession) {
    setError(null);
    const confirmed = window.confirm("Delete this session?");
    if (!confirmed) {
      return;
    }

    try {
      const next = await deleteSession(session.startedAt, session.endedAt);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session.");
    }
  }

  async function editSessionTask(session: PomodoroSession, taskId: string | null) {
    setError(null);
    try {
      const next = await updateSessionTask(session.startedAt, session.endedAt, taskId);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session task.");
    }
  }

  async function toggleAutoSwitch(nextValue: boolean) {
    setError(null);
    try {
      const next = await updateAutoSwitch(nextValue);
      setState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update auto-switch setting.");
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 to-black px-4 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <Card className={`space-y-4 ${isRestMode ? "border-sky-700/60 bg-sky-950/20" : ""}`}>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-wide">Minimal Pomodoro</h1>
            <span className={`rounded-full border px-3 py-1 text-xs ${isRestMode ? "border-sky-600 text-sky-300" : "border-zinc-700 text-zinc-300"}`}>{modeLabel}</span>
          </div>
          <p className="text-sm text-zinc-400">
            {formatTime(minutesToSeconds(state.focusMinutes))} focus / {formatTime(minutesToSeconds(state.restMinutes))} rest
          </p>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <span>Current task:</span>
            {activeTask ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-2 py-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorForTaskId(activeTask.id) }} />
                {activeTask.name}
              </span>
            ) : (
              <span className="text-zinc-500">Unassigned</span>
            )}
          </div>
        </Card>

        <Card className={`space-y-4 text-center ${isRestMode ? "border-sky-700/60 bg-sky-950/20" : ""}`}>
          <p className={`font-mono text-7xl tracking-widest ${isRestMode ? "text-sky-300" : ""}`}>{formatTime(remainingSeconds)}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button onClick={isRunning ? pause : start}>
              {isRunning ? "Pause" : "Start"}
            </Button>
            <Button onClick={reset}>Reset</Button>
            <Button
              className={isRestMode ? "border-sky-700 bg-sky-900/50 hover:bg-sky-800/60" : ""}
              onClick={toggleMode}
            >
              {modeToggleLabel}
            </Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Focus minutes</label>
              <Input type="number" min={0.016} step={0.001} max={180} value={focusInput} onChange={(e) => setFocusInput(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Rest minutes</label>
              <Input type="number" min={0.016} step={0.001} max={180} value={restInput} onChange={(e) => setRestInput(e.target.value)} />
            </div>
            <Button onClick={() => void saveDurations()}>Save Durations</Button>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-zinc-400">Target pomodoros per day</label>
              <Input type="number" min={1} max={100} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
            </div>
            <Button onClick={() => void saveTarget()}>Save Target</Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">Progress today</span>
              <span className="font-medium">{completedToday} / {state.targetPerDay}</span>
            </div>
            <Progress value={progressRatio * 100} />
          </div>

          <div className="flex items-center justify-between text-sm text-zinc-400">
            <span>Total sessions: {state.sessions.length}</span>
            <span>Total focused: {totalFocusedMinutes} min</span>
            <span>Streak: {streak} day(s)</span>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-400"
              checked={state.autoSwitch}
              onChange={(e) => void toggleAutoSwitch(e.target.checked)}
            />
            Auto-switch focus/rest
          </label>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </Card>

        <Card className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300">Tasks</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <Input
              className="h-10"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Add a task"
              maxLength={80}
            />
            <Button className="h-10 px-4 text-sm" onClick={() => void createTask()}>
              Add Task
            </Button>
          </div>
          {state.tasks.length === 0 ? (
            <p className="text-sm text-zinc-500">No tasks yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 text-zinc-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
                  Unassigned
                </div>
                <Button className="h-8 px-2 py-1 text-xs" onClick={() => void selectActiveTask(null)}>
                  {state.activeTaskId === null ? "Active" : "Set Active"}
                </Button>
              </div>
              {state.tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorForTaskId(task.id) }} />
                    {task.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button className="h-8 px-2 py-1 text-xs" onClick={() => void selectActiveTask(task.id)}>
                      {state.activeTaskId === task.id ? "Active" : "Set Active"}
                    </Button>
                    <Button
                      className="h-8 border-rose-800 bg-rose-950/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/60"
                      onClick={() => void deleteTaskItem(task)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-300">Task Focus Summary</h2>
            <select
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm text-zinc-200"
              value={summaryRange}
              onChange={(e) => setSummaryRange(e.target.value as SummaryRange)}
            >
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
          </div>
          {summaryRows.length === 0 ? (
            <p className="text-sm text-zinc-500">No focused time in this range.</p>
          ) : (
            <div className="space-y-2">
              {summaryRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.name}
                  </div>
                  <span className="font-mono text-zinc-300">{row.minutes} min</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-300">Previous Focus Sessions</h2>
            <span className="text-xs text-zinc-500">latest {recentSessions.length}</span>
          </div>

          {recentSessions.length === 0 ? (
            <p className="text-sm text-zinc-500">No sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((session, idx) => {
                const task = session.taskId ? taskById.get(session.taskId) ?? null : null;
                return (
                  <div key={`${session.startedAt}-${session.endedAt}-${idx}`} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
                    <div className="text-zinc-300">
                      <span>{formatSessionStamp(session.startedAt)}</span>
                      <span className="px-2 text-zinc-600">{"->"}</span>
                      <span>{formatSessionStamp(session.endedAt)}</span>
                      <span className="ml-3 inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 text-xs font-medium text-zinc-300">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task ? colorForTaskId(task.id) : "#71717a" }} />
                        Task: {task ? task.name : "Unassigned"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-zinc-400">{formatSessionDuration(session)}</span>
                      <select
                        className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                        value={session.taskId ?? ""}
                        onChange={(e) => void editSessionTask(session, e.target.value === "" ? null : e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {state.tasks.map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        className="border-rose-800 bg-rose-950/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/60"
                        onClick={() => void removeSession(session)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
