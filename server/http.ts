// Small helpers shared by the /api routes: CORS for the mobile app, an optional
// access code so strangers can't spend your Claude credits, and error mapping.
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { CopilotError } from "./copilot.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Copilot-Code",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function route<S extends z.ZodType, R>(schema: S, run: (input: z.infer<S>) => Promise<R>) {
  return async (req: Request) => {
    const code = process.env.APP_ACCESS_CODE;
    if (code && req.headers.get("x-copilot-code") !== code) return json({ error: "Wrong access code." }, 401);
    if (!process.env.ANTHROPIC_API_KEY) return json({ error: "The server has no Claude API key yet. Add ANTHROPIC_API_KEY (see the README)." }, 500);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Bad request." }, 400);
    try {
      return json(await run(parsed.data));
    } catch (e) {
      if (e instanceof CopilotError) return json({ error: e.message }, e.status);
      if (e instanceof Anthropic.RateLimitError) return json({ error: "Too many requests just now. Try again in a minute." }, 429);
      if (e instanceof Anthropic.AuthenticationError) return json({ error: "The server's Claude API key is missing or wrong." }, 500);
      if (e instanceof Anthropic.BadRequestError) return json({ error: "Claude couldn't read that. Try a smaller file or shorter text." }, 400);
      if (e instanceof Anthropic.APIError) return json({ error: "Claude is unavailable right now. Try again." }, 502);
      console.error(e);
      return json({ error: "Something went wrong." }, 500);
    }
  };
}
