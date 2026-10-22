// Prompts and tool definitions shared by the server and the in-Claude test build.

export function briefPrompt(i: { text: string; source: string; today: string; existingGroups: string[]; imageCount: number; existingTasks?: string[]; live?: boolean }) {
  const shots = i.imageCount
    ? `\n${i.imageCount} screenshot(s) of the user's screen are attached. Read what they're working on (open documents, tickets, chats, calendar, email) and pull out tasks, deadlines and anything left unanswered.`
    : "";
  return `You are Co-Pilot, a work assistant. Today is ${i.today}. The user is "me" in the notes.
Source type: ${i.source}.${shots}
Turn the notes below into a structured brief: a short title (max 8 words), a 1-2 sentence summary, decisions, people mentioned, to-dos and gaps.
Rules: include tasks for everyone, not just me; owner is "me", a person's name, or null. Resolve relative dates ("Friday", "next week") against today as YYYY-MM-DD, else null. Group is a short topic/project label; reuse one of these when it fits: ${JSON.stringify(i.existingGroups)}. Gaps are what is missing or unclear (no owner, no date, vague commitment, open question, unconfirmed dependency), each with one concrete ask to close it. Be thorough with gaps.${i.live ? `
This is one part of a live session that Co-Pilot is ${i.imageCount ? "watching on the user's screen" : "hearing as it happens"}, so it may be partial, messy speech-to-text or start mid-sentence. Only pick up real work items; ignore small talk. Do not repeat anything already known: ${JSON.stringify((i.existingTasks ?? []).slice(0, 80))}. Empty lists are fine.` : ""}

NOTES:
"""${i.text || "(no text, use the screenshots)"}"""`;
}

export function dayPrompt(i: { now: string; recent: unknown[]; todos: unknown[]; gaps: unknown[] }) {
  return `You are Co-Pilot. Now: ${i.now}. Write the user's brief for today in plain text, no markdown symbols, under 170 words.
Structure: a one-line headline of the day; "Do first:" up to 3 of MY tasks (owner "me" or null) by urgency and priority; "Waiting on others:" tasks owned by other people that I should nudge; "Close these gaps:" the most important missing pieces with the ask. Flag anything overdue or due within 2 days.
Recent captures: ${JSON.stringify(i.recent)}
Open to-dos: ${JSON.stringify(i.todos)}
Open gaps: ${JSON.stringify(i.gaps)}`;
}

export function prioritizePrompt(i: { now: string; items: unknown[] }) {
  return `You are Co-Pilot. Now: ${i.now}. Rank what the user (owner "me" or null) should tackle next, mixing their tasks with missing pieces they need to chase. Weigh deadlines, things blocking other people, and priority. Pick at most 7, each with a reason under 15 words. Use only keys from this list.
Items: ${JSON.stringify(i.items)}`;
}

export const CHAT_SYSTEM = `You are Co-Pilot, the user's spoken work assistant. Your replies are read aloud, so talk like a helpful colleague: plain sentences, no lists, no markdown, usually under 60 words. Use list_items to look at their work before answering about it. When they ask you to remember or remind them of something, use add_todo (with remindAt for a time). Point out missing pieces when relevant. Never invent tasks.`;

export const TOOL_DEFS = [
  { name: "list_items", description: "Get the user's open to-dos, missing pieces, reminders and recent captures. Call this before answering questions about their work.",
    input_schema: { type: "object" as const, properties: {} } },
  { name: "add_todo", description: "Add a to-do for the user. Use for anything they ask you to remember.",
    input_schema: { type: "object" as const, properties: {
      task: { type: "string" }, owner: { type: "string", description: "'me' or a person's name" },
      due: { type: "string", description: "YYYY-MM-DD" }, group: { type: "string" },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      remindAt: { type: "string", description: "ISO 8601 date-time with timezone offset, for a reminder" },
    }, required: ["task"] } },
  { name: "complete_todo", description: "Mark a to-do done, by its key from list_items.",
    input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "set_reminder", description: "Set or change a reminder on an existing to-do.",
    input_schema: { type: "object" as const, properties: { key: { type: "string" }, remindAt: { type: "string", description: "ISO 8601 date-time with timezone offset" } }, required: ["key", "remindAt"] } },
];
