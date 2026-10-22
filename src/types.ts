export type Priority = "high" | "medium" | "low";

export interface Todo {
  id: string;
  task: string;
  owner: string | null;
  due: string | null; // YYYY-MM-DD
  group: string;
  priority: Priority;
  done: boolean;
  remindAt?: string | null; // ISO date-time
}

export interface Gap {
  id: string;
  issue: string;
  ask: string;
  done: boolean;
}

export interface Capture {
  id: string;
  createdAt: string;
  source: string;
  title: string;
  summary: string;
  decisions: string[];
  people: string[];
  todos: Todo[];
  gaps: Gap[];
  raw: string;
}

export type TodoRef = Todo & { cid: string; from: string };
export type GapRef = Gap & { cid: string; from: string };
