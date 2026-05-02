import OpenAI from "openai";

/**
 * Shared OpenAI client for server-side AI features.
 *
 * Configuration via environment variables:
 *   - OPENAI_API_KEY  (required at request time; an empty string is allowed at
 *                      module load to avoid crashing the server in environments
 *                      that don't use AI features — calls will fail with a
 *                      clear error instead).
 *   - OPENAI_BASE_URL (optional; for proxies or alternative compatible
 *                      providers).
 *   - OPENAI_ORG      (optional; OpenAI organization id).
 */
const apiKey = process.env["OPENAI_API_KEY"] ?? "";
const baseURL = process.env["OPENAI_BASE_URL"];
const organization = process.env["OPENAI_ORG"];

export const openai: OpenAI = new OpenAI({
  apiKey: apiKey || "missing-openai-api-key",
  ...(baseURL ? { baseURL } : {}),
  ...(organization ? { organization } : {}),
});

export default openai;
export type { OpenAI };
