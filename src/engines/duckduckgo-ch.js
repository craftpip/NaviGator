import { DuckDuckGoBrowserDriver } from "./duckduckgo-browser.js";

export class DuckDuckGoChDriver extends DuckDuckGoBrowserDriver {
  id = "duckduckgo_ch";
  backend = "chromium";
  pool = "engine";
  exposedInMcp = false;
  homeUrl = "https://duckduckgo.com/";
}
