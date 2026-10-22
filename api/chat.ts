import { chat, ChatInput } from "../server/copilot.js";
import { preflight, route } from "../server/http.js";

export const POST = route(ChatInput, chat);
export const OPTIONS = preflight;
