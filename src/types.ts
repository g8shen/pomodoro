export type Mode = "focus" | "rest";

export interface PomodoroTask {
  id: string;
  name: string;
  createdAt: string;
}

export interface PomodoroSession {
  startedAt: string;
  endedAt: string;
  taskId: string | null;
  focusedSeconds: number;
}

export interface PomodoroState {
  targetPerDay: number;
  focusMinutes: number;
  restMinutes: number;
  autoSwitch: boolean;
  activeTaskId: string | null;
  tasks: PomodoroTask[];
  sessions: PomodoroSession[];
}
