import { DuckDuckGoBrowserDriver } from "./duckduckgo-browser.js";

export class DuckDuckGoCbDriver extends DuckDuckGoBrowserDriver {
  id = "duckduckgo_cb";
  backend = "cloakbrowser";
  pool = "engine";
  exposedInMcp = true;
  homeUrl = "https://duckduckgo.com/";
}
