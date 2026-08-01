import { mcpCall } from "./_lib.js";

const query = process.argv[2] || "what is the model context protocol";

const result = await mcpCall("web_search", { query, limit: 5 });
console.log(result.content[0].text);
