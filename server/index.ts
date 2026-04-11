import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PomodoroTask {
  id: string;
  name: string;
  createdAt: string;
}

interface PomodoroSession {
  startedAt: string;
  endedAt: string;
  taskId: string | null;
  focusedSeconds: number;
}

interface PomodoroData {
  targetPerDay: number;
  focusMinutes: number;
  restMinutes: number;
  autoSwitch: boolean;
  activeTaskId: string | null;
  tasks: PomodoroTask[];
  sessions: PomodoroSession[];
}

const DEFAULT_DATA: PomodoroData = {
  targetPerDay: 8,
  focusMinutes: 25,
  restMinutes: 5,
  autoSwitch: true,
  activeTaskId: null,
  tasks: [],
  sessions: []
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFilePath = path.resolve(__dirname, "../data/pomodoro-data.json");

function normalizeFocusedSeconds(value: unknown, startedAt: Date, endedAt: Date): number | null {
  const numeric = typeof value === "number" ? value : Number.NaN;
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

function clampMinuteValue(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 180) {
    return fallback;
  }
  return Math.round(numeric * 1000) / 1000;
}

function normalizeTask(input: unknown): PomodoroTask | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const maybe = input as Partial<PomodoroTask>;
  if (typeof maybe.id !== "string" || typeof maybe.name !== "string" || typeof maybe.createdAt !== "string") {
    return null;
  }

  const created = new Date(maybe.createdAt);
  if (Number.isNaN(created.getTime())) {
    return null;
  }

  const name = maybe.name.trim();
  if (!name) {
    return null;
  }

  return {
    id: maybe.id,
    name,
    createdAt: created.toISOString()
  };
}

function normalizeSession(input: unknown): PomodoroSession | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const maybe = input as Partial<PomodoroSession>;
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

function sanitizeData(raw: Partial<PomodoroData>): PomodoroData {
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks
        .map((task) => normalizeTask(task))
        .filter((task): task is PomodoroTask => task !== null)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  const taskIds = new Set(tasks.map((task) => task.id));

  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions
        .map((session) => normalizeSession(session))
        .filter((session): session is NonNullable<ReturnType<typeof normalizeSession>> => session !== null)
        .map((session) => ({
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          taskId: session.taskId && taskIds.has(session.taskId) ? session.taskId : null,
          focusedSeconds: Math.max(1, Math.round(session.focusedSeconds))
        }))
        .sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime())
    : [];

  const activeTaskId = typeof raw.activeTaskId === "string" && taskIds.has(raw.activeTaskId) ? raw.activeTaskId : null;

  return {
    targetPerDay:
      typeof raw.targetPerDay === "number" && raw.targetPerDay > 0
        ? Math.floor(raw.targetPerDay)
        : DEFAULT_DATA.targetPerDay,
    focusMinutes: clampMinuteValue(raw.focusMinutes, DEFAULT_DATA.focusMinutes),
    restMinutes: clampMinuteValue(raw.restMinutes, DEFAULT_DATA.restMinutes),
    autoSwitch: typeof raw.autoSwitch === "boolean" ? raw.autoSwitch : DEFAULT_DATA.autoSwitch,
    activeTaskId,
    tasks,
    sessions
  };
}

async function ensureDataFile(): Promise<void> {
  try {
    await fs.access(dataFilePath);
  } catch {
    await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
    await fs.writeFile(dataFilePath, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8");
  }
}

async function readData(): Promise<PomodoroData> {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(dataFilePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PomodoroData>;
    return sanitizeData(parsed);
  } catch {
    await fs.writeFile(dataFilePath, JSON.stringify(DEFAULT_DATA, null, 2), "utf-8");
    return { ...DEFAULT_DATA };
  }
}

async function writeData(data: PomodoroData): Promise<void> {
  await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), "utf-8");
}

function generateTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const app = express();
app.use(express.json());

app.get("/api/state", async (_req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to read state." });
  }
});

app.post("/api/target", async (req, res) => {
  try {
    const target = Number(req.body?.targetPerDay);
    if (!Number.isInteger(target) || target < 1 || target > 100) {
      return res.status(400).json({ error: "targetPerDay must be an integer between 1 and 100." });
    }

    const data = await readData();
    data.targetPerDay = target;
    await writeData(data);

    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to update target." });
  }
});

app.post("/api/durations", async (req, res) => {
  try {
    const focusMinutes = Number(req.body?.focusMinutes);
    const restMinutes = Number(req.body?.restMinutes);

    if (!Number.isFinite(focusMinutes) || focusMinutes <= 0 || focusMinutes > 180) {
      return res.status(400).json({ error: "focusMinutes must be a number between 0 and 180." });
    }

    if (!Number.isFinite(restMinutes) || restMinutes <= 0 || restMinutes > 180) {
      return res.status(400).json({ error: "restMinutes must be a number between 0 and 180." });
    }

    const data = await readData();
    data.focusMinutes = Math.round(focusMinutes * 1000) / 1000;
    data.restMinutes = Math.round(restMinutes * 1000) / 1000;
    await writeData(data);

    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to update durations." });
  }
});

app.post("/api/auto-switch", async (req, res) => {
  try {
    const autoSwitch = req.body?.autoSwitch;
    if (typeof autoSwitch !== "boolean") {
      return res.status(400).json({ error: "autoSwitch must be a boolean." });
    }

    const data = await readData();
    data.autoSwitch = autoSwitch;
    await writeData(data);
    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to update auto-switch setting." });
  }
});

app.post("/api/task", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ error: "Task name is required." });
    }

    const data = await readData();
    const task: PomodoroTask = {
      id: generateTaskId(),
      name: name.slice(0, 80),
      createdAt: new Date().toISOString()
    };

    data.tasks.push(task);
    if (!data.activeTaskId) {
      data.activeTaskId = task.id;
    }
    await writeData(data);
    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to add task." });
  }
});

app.post("/api/task/active", async (req, res) => {
  try {
    const activeTaskId = req.body?.activeTaskId;
    if (activeTaskId !== null && typeof activeTaskId !== "string") {
      return res.status(400).json({ error: "activeTaskId must be a string or null." });
    }

    const data = await readData();
    if (activeTaskId !== null && !data.tasks.some((task) => task.id === activeTaskId)) {
      return res.status(400).json({ error: "Task not found." });
    }

    data.activeTaskId = activeTaskId;
    await writeData(data);
    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to update active task." });
  }
});

app.post("/api/task/delete", async (req, res) => {
  try {
    const taskId = req.body?.taskId;
    if (typeof taskId !== "string") {
      return res.status(400).json({ error: "taskId is required." });
    }

    const data = await readData();
    data.tasks = data.tasks.filter((task) => task.id !== taskId);
    if (data.activeTaskId === taskId) {
      data.activeTaskId = null;
    }
    data.sessions = data.sessions.map((session) =>
      session.taskId === taskId ? { ...session, taskId: null } : session
    );
    await writeData(data);
    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to delete task." });
  }
});

app.post("/api/session", async (req, res) => {
  try {
    const startedAt = req.body?.startedAt;
    const endedAt = req.body?.endedAt;
    const completedAt = req.body?.completedAt;
    const taskId = typeof req.body?.taskId === "string" ? req.body.taskId : null;
    const focusedSecondsRaw = Number(req.body?.focusedSeconds);

    const startedDate = typeof startedAt === "string" ? new Date(startedAt) : null;
    const endedDate = typeof endedAt === "string" ? new Date(endedAt) : typeof completedAt === "string" ? new Date(completedAt) : null;

    if (!startedDate || !endedDate || Number.isNaN(startedDate.getTime()) || Number.isNaN(endedDate.getTime())) {
      return res.status(400).json({ error: "startedAt and endedAt must be valid ISO dates." });
    }

    const data = await readData();
    const normalizedTaskId = taskId && data.tasks.some((task) => task.id === taskId) ? taskId : null;

    const nextSession: PomodoroSession = {
      startedAt: startedDate.toISOString(),
      endedAt: endedDate.toISOString(),
      taskId: normalizedTaskId,
      focusedSeconds:
        Number.isFinite(focusedSecondsRaw) && focusedSecondsRaw > 0
          ? Math.max(1, Math.round(focusedSecondsRaw))
          : Math.max(1, Math.round((endedDate.getTime() - startedDate.getTime()) / 1000))
    };

    const key = `${nextSession.startedAt}|${nextSession.endedAt}|${nextSession.taskId ?? "none"}`;
    const existing = new Set(
      data.sessions.map((s) => `${s.startedAt}|${s.endedAt}|${s.taskId ?? "none"}`)
    );

    if (!existing.has(key)) {
      data.sessions.push(nextSession);
      data.sessions.sort((a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
      await writeData(data);
    }

    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to record session." });
  }
});

app.post("/api/session/delete", async (req, res) => {
  try {
    const startedAt = req.body?.startedAt;
    const endedAt = req.body?.endedAt;

    if (typeof startedAt !== "string" || typeof endedAt !== "string") {
      return res.status(400).json({ error: "startedAt and endedAt are required." });
    }

    const startedDate = new Date(startedAt);
    const endedDate = new Date(endedAt);
    if (Number.isNaN(startedDate.getTime()) || Number.isNaN(endedDate.getTime())) {
      return res.status(400).json({ error: "startedAt and endedAt must be valid ISO dates." });
    }

    const startedIso = startedDate.toISOString();
    const endedIso = endedDate.toISOString();

    const data = await readData();
    data.sessions = data.sessions.filter(
      (session) => !(session.startedAt === startedIso && session.endedAt === endedIso)
    );
    await writeData(data);

    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to delete session." });
  }
});

app.post("/api/session/task", async (req, res) => {
  try {
    const startedAt = req.body?.startedAt;
    const endedAt = req.body?.endedAt;
    const taskIdRaw = req.body?.taskId;

    if (typeof startedAt !== "string" || typeof endedAt !== "string") {
      return res.status(400).json({ error: "startedAt and endedAt are required." });
    }

    if (taskIdRaw !== null && typeof taskIdRaw !== "string") {
      return res.status(400).json({ error: "taskId must be a string or null." });
    }

    const startedDate = new Date(startedAt);
    const endedDate = new Date(endedAt);
    if (Number.isNaN(startedDate.getTime()) || Number.isNaN(endedDate.getTime())) {
      return res.status(400).json({ error: "startedAt and endedAt must be valid ISO dates." });
    }

    const startedIso = startedDate.toISOString();
    const endedIso = endedDate.toISOString();

    const data = await readData();
    const taskId = taskIdRaw && data.tasks.some((task) => task.id === taskIdRaw) ? taskIdRaw : null;

    const idx = data.sessions.findIndex(
      (session) => session.startedAt === startedIso && session.endedAt === endedIso
    );

    if (idx < 0) {
      return res.status(404).json({ error: "Session not found." });
    }

    data.sessions[idx] = { ...data.sessions[idx], taskId };
    await writeData(data);
    return res.json(data);
  } catch {
    return res.status(500).json({ error: "Failed to update session task." });
  }
});

const port = 8787;
app.listen(port, () => {
  console.log(`Pomodoro API listening on http://localhost:${port}`);
});
