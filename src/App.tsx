import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Input, Progress } from "./components/ui";
import { calculateStreak, formatMinutesForDisplay, formatTime, isSessionToday, minutesToSeconds } from "./lib/time";
import {
  EMPTY_STATE,
  addSession,
  addTask,
  deleteSession,
  deleteSessions,
  exportData,
  importData,
  readState,
  removeTask,
  setActiveTask,
  updateAutoSwitch,
  updateDurations,
  updateSessionTask,
  updateTarget
} from "./lib/storage";
import type { Mode, PomodoroSession, PomodoroState, PomodoroTask } from "./types";

type SummaryRange = "day" | "week" | "month" | "all";

function sessionKey(session: PomodoroSession): string {
  return `${session.startedAt}|${session.endedAt}`;
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
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const completingRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
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

  const todaySessions = useMemo(() => state.sessions.filter(isSessionToday), [state.sessions]);
  const completedToday = todaySessions.length;
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
  const [selectedSessionKeys, setSelectedSessionKeys] = useState<Set<string>>(() => new Set());
  const selectedRecentCount = recentSessions.filter((session) => selectedSessionKeys.has(sessionKey(session))).length;
  const allRecentSelected = recentSessions.length > 0 && selectedRecentCount === recentSessions.length;

  const focusedTodayMinutes = useMemo(() => {
    return todaySessions.reduce((sum, session) => sum + focusedMinutes(session), 0);
  }, [todaySessions]);

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
    const nextRemainingSeconds =
      !Number.isFinite(remainingSeconds) || remainingSeconds <= 0 ? durationFor(mode, state) : remainingSeconds;

    if (nextRemainingSeconds !== remainingSeconds) {
      setRemainingSeconds(nextRemainingSeconds);
    }

    if (mode === "focus" && !focusStartedAtRef.current) {
      focusStartedAtRef.current = new Date().toISOString();
      sessionTaskIdRef.current = state.activeTaskId;
      sessionFocusedSecondsRef.current = Math.max(1, nextRemainingSeconds);
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

  function toggleSessionSelected(session: PomodoroSession) {
    const key = sessionKey(session);
    setSelectedSessionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleSelectAllSessions() {
    setSelectedSessionKeys(allRecentSelected ? new Set() : new Set(recentSessions.map(sessionKey)));
  }

  async function removeSelectedSessions() {
    setError(null);
    const targets = recentSessions.filter((session) => selectedSessionKeys.has(sessionKey(session)));
    if (targets.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${targets.length} session${targets.length === 1 ? "" : "s"}?`);
    if (!confirmed) {
      return;
    }

    try {
      const next = await deleteSessions(targets.map(({ startedAt, endedAt }) => ({ startedAt, endedAt })));
      setState(next);
      setSelectedSessionKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sessions.");
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

  function downloadBackup() {
    setBackupMessage(null);
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pomodoro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(file: File) {
    setBackupMessage(null);
    const confirmed = window.confirm(
      "Importing replaces all tasks, sessions, and settings in this browser. Continue?"
    );
    if (!confirmed) {
      return;
    }

    try {
      const next = await importData(await file.text());
      setIsRunning(false);
      setMode("focus");
      focusStartedAtRef.current = null;
      sessionTaskIdRef.current = null;
      sessionFocusedSecondsRef.current = null;
      setSelectedSessionKeys(new Set());
      setState(next);
      setTargetInput(String(next.targetPerDay));
      setFocusInput(String(next.focusMinutes));
      setRestInput(String(next.restMinutes));
      setRemainingSeconds(durationFor("focus", next));
      setBackupMessage(`Imported ${next.tasks.length} task(s) and ${next.sessions.length} session(s).`);
    } catch (err) {
      setBackupMessage(err instanceof Error ? err.message : "Failed to import backup.");
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
          <div className="grid grid-cols-1 gap-3 border-t border-zinc-800 pt-4 text-left sm:grid-cols-2">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Today&apos;s sessions</p>
              <p className="mt-1 font-mono text-xl text-zinc-100">{completedToday}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Today&apos;s focus</p>
              <p className="mt-1 font-mono text-xl text-zinc-100">{formatMinutesForDisplay(focusedTodayMinutes)}</p>
            </div>
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
            <span>Streak</span>
            <span>{streak} day(s)</span>
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
                  <span className="font-mono text-zinc-300">{formatMinutesForDisplay(row.minutes)}</span>
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

          {recentSessions.length > 0 && (
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-rose-500"
                  checked={allRecentSelected}
                  onChange={toggleSelectAllSessions}
                />
                Select all
              </label>
              <Button
                className="border-rose-800 bg-rose-950/50 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/60"
                disabled={selectedRecentCount === 0}
                onClick={() => void removeSelectedSessions()}
              >
                Delete selected ({selectedRecentCount})
              </Button>
            </div>
          )}

          {recentSessions.length === 0 ? (
            <p className="text-sm text-zinc-500">No sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((session, idx) => {
                const task = session.taskId ? taskById.get(session.taskId) ?? null : null;
                return (
                  <div key={`${session.startedAt}-${session.endedAt}-${idx}`} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
                    <div className="flex items-center text-zinc-300">
                      <input
                        type="checkbox"
                        className="mr-3 h-4 w-4 cursor-pointer accent-rose-500"
                        checked={selectedSessionKeys.has(sessionKey(session))}
                        onChange={() => toggleSessionSelected(session)}
                      />
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

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300">Backup</h2>
          <p className="text-sm text-zinc-500">
            Data is saved in this browser only. Export a backup to keep it safe or move it to another device.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button className="text-sm" onClick={downloadBackup}>
              Export
            </Button>
            <Button className="text-sm" onClick={() => importInputRef.current?.click()}>
              Import
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) {
                  void restoreBackup(file);
                }
              }}
            />
          </div>
          {backupMessage ? <p className="text-sm text-zinc-400">{backupMessage}</p> : null}
        </Card>
      </div>
    </main>
  );
}
