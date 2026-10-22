import { day, DayInput } from "../server/copilot.js";
import { preflight, route } from "../server/http.js";

export const POST = route(DayInput, day);
export const OPTIONS = preflight;
