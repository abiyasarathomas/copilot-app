export type Priority = "high" | "medium" | "low";

export interface Todo {
  id: string;
  task: string;
  owner: string | null; // who has to do it: "me", a name, or null (nobody took it)
  to?: string | null;    // who it is owed to
  quote?: string | null; // the words it came from
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
