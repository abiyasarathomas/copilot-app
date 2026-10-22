import { prioritize, PrioritizeInput } from "../server/copilot.js";
import { preflight, route } from "../server/http.js";

export const POST = route(PrioritizeInput, prioritize);
export const OPTIONS = preflight;
