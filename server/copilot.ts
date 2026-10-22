// Everything that talks to Claude lives here. The API key never leaves the server.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = "claude-opus-5-5";
// If Claude declines a request for policy reasons, the API retries it on
// Anthropic's recommended fallback model instead of returning an empty answer.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export class CopilotError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function refused(stop: string | null) {
  if (stop === "refusal") throw new CopilotError(422, "Claude declined this request.");
}

/* ---------- capture -> structured brief ---------- */
const Brief = z.object({
  title: z.string(),
  summary: z.string(),
  decisions: z.array(z.string()),
  people: z.array(z.string()),
  todos: z.array(z.object({
    task: z.string(),
    owner: z.string().nullable(),
    due: z.string().nullable(),
    group: z.string(),
    priority: z.enum(["high", "medium", "low"]),
  })),
  gaps: z.array(z.object({ issue: z.string(), ask: z.string() })),
});
export type BriefResult = z.infer<typeof Brief>;

export const BriefInput = z.object({
  text: z.string().max(60000),
  source: z.string().max(40),
  today: z.string(),
  existingGroups: z.array(z.string()).max(50),
  images: z.array(z.object({
    media_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
    data: z.string(),
  })).max(5),
});

export async function brief(input: z.infer<typeof BriefInput>): Promise<BriefResult> {
  const shots = input.images.length
    ? `\n${input.images.length} screenshot(s) of the user's screen are attached. Read what they're working on (open documents, tickets, chats, calendar, email) and pull out tasks, deadlines and anything left unanswered.`
    : "";
  const prompt = `You are Co-Pilot, a work assistant. Today is ${input.today}. The user is "me" in the notes.
Source type: ${input.source}.${shots}
Turn the notes below into a structured brief: a short title (max 8 words), a 1-2 sentence summary, decisions, people mentioned, to-dos and gaps.
Rules: include tasks for everyone, not just me; owner is "me", a person's name, or null. Resolve relative dates ("Friday", "next week") against today as YYYY-MM-DD, else null. Group is a short topic/project label; reuse one of these when it fits: ${JSON.stringify(input.existingGroups)}. Gaps are what is missing or unclear (no owner, no date, vague commitment, open question, unconfirmed dependency), each with one concrete ask to close it. Be thorough with gaps.

NOTES:
"""${input.text || "(no text, use the screenshots)"}"""`;

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Brief) },
    messages: [{
      role: "user",
      content: [
        ...input.images.map(img => ({ type: "image" as const, source: { type: "base64" as const, ...img } })),
        { type: "text" as const, text: prompt },
      ],
    }],
    ...FALLBACK,
  });
  refused(res.stop_reason);
  if (!res.parsed_output) throw new CopilotError(502, "Couldn't read those notes.");
  return res.parsed_output;
}

/* ---------- today's brief ---------- */
export const DayInput = z.object({
  now: z.string(),
  recent: z.array(z.unknown()).max(20),
  todos: z.array(z.unknown()).max(300),
  gaps: z.array(z.unknown()).max(300),
});

export async function day(input: z.infer<typeof DayInput>): Promise<string> {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    messages: [{
      role: "user",
      content: `You are Co-Pilot. Now: ${input.now}. Write the user's brief for today in plain text, no markdown symbols, under 170 words.
Structure: a one-line headline of the day; "Do first:" up to 3 of MY tasks (owner "me" or null) by urgency and priority; "Waiting on others:" tasks owned by other people that I should nudge; "Close these gaps:" the most important missing pieces with the ask. Flag anything overdue or due within 2 days.
Recent captures: ${JSON.stringify(input.recent)}
Open to-dos: ${JSON.stringify(input.todos)}
Open gaps: ${JSON.stringify(input.gaps)}`,
    }],
    ...FALLBACK,
  });
  refused(res.stop_reason);
  return res.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("").trim();
}

/* ---------- prioritize ---------- */
const Order = z.object({ order: z.array(z.object({ key: z.string(), why: z.string() })) });
export const PrioritizeInput = z.object({
  now: z.string(),
  items: z.array(z.object({ key: z.string() }).passthrough()).max(300),
});

export async function prioritize(input: z.infer<typeof PrioritizeInput>) {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: betaZodOutputFormat(Order) },
    messages: [{
      role: "user",
      content: `You are Co-Pilot. Now: ${input.now}. Rank what the user (owner "me" or null) should tackle next, mixing their tasks with missing pieces they need to chase. Weigh deadlines, things blocking other people, and priority. Pick at most 7, each with a reason under 15 words. Use only keys from this list.
Items: ${JSON.stringify(input.items)}`,
    }],
    ...FALLBACK,
  });
  refused(res.stop_reason);
  return res.parsed_output ?? { order: [] };
}

/* ---------- talk to Co-Pilot ----------
   Your to-dos live on your device, so the tools run in the app: the server
   makes one Claude call and returns any tool calls; the app runs them and
   sends the results back for the next turn. */
const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { name: "list_items", description: "Get the user's open to-dos, missing pieces, reminders and recent captures. Call this before answering questions about their work.",
    input_schema: { type: "object", properties: {} } },
  { name: "add_todo", description: "Add a to-do for the user. Use for anything they ask you to remember.",
    input_schema: { type: "object", properties: {
      task: { type: "string" }, owner: { type: "string", description: "'me' or a person's name" },
      due: { type: "string", description: "YYYY-MM-DD" }, group: { type: "string" },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      remindAt: { type: "string", description: "ISO 8601 date-time with timezone offset, for a reminder" },
    }, required: ["task"] } },
  { name: "complete_todo", description: "Mark a to-do done, by its key from list_items.",
    input_schema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "set_reminder", description: "Set or change a reminder on an existing to-do.",
    input_schema: { type: "object", properties: { key: { type: "string" }, remindAt: { type: "string", description: "ISO 8601 date-time with timezone offset" } }, required: ["key", "remindAt"] } },
];

const SYSTEM = `You are Co-Pilot, the user's spoken work assistant. Your replies are read aloud, so talk like a helpful colleague: plain sentences, no lists, no markdown, usually under 60 words. Use list_items to look at their work before answering about it. When they ask you to remember or remind them of something, use add_todo (with remindAt for a time). Point out missing pieces when relevant. Never invent tasks.`;

export const ChatInput = z.object({
  now: z.string(),
  // The full conversation, including Claude's earlier replies exactly as returned.
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.unknown() })).min(1).max(80),
});

export async function chat(input: z.infer<typeof ChatInput>) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system: `${SYSTEM}\nNow: ${input.now}.`,
    tools: TOOLS,
    messages: input.messages as Anthropic.Beta.BetaMessageParam[],
    ...FALLBACK,
  });
  refused(res.stop_reason);
  return { content: res.content, stop_reason: res.stop_reason };
}
