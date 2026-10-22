import { brief, BriefInput } from "../server/copilot.js";
import { preflight, route } from "../server/http.js";

export const POST = route(BriefInput, brief);
export const OPTIONS = preflight;
