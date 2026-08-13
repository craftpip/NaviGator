import { writeFile } from "node:fs/promises";
import { mcpCall } from "./_lib.js";

const url = process.argv[2] || "https://example.com";
const out = process.argv[3] || "screenshot.jpg";

const result = await mcpCall("web_page_screenshot", { url, fullPage: false });
const text = result.content[0].text;

const dataUrlMatch = text.match(/!\[[^\]]*\]\((data:image\/jpeg;base64,[^)]+)\)/);
if (!dataUrlMatch) {
  console.error(`No screenshot data in response:\n${text.slice(0, 500)}`);
  process.exit(1);
}

await writeFile(out, Buffer.from(dataUrlMatch[1].split(",")[1], "base64"));
console.log(`Saved screenshot to ${out}`);
