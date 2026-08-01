import { mcpCall } from "./_lib.js";

const url = process.argv[2] || "https://example.com";
const maxChars = Number(process.env.MAX_CHARS || 8000);

const result = await mcpCall("web_fetch", { url, maxChars });
console.log(result.content[0].text);
