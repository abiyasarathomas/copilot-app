import { draft, DraftInput } from "../server/copilot.js";
import { preflight, route } from "../server/http.js";

export const POST = route(DraftInput, draft);
export const OPTIONS = preflight;
