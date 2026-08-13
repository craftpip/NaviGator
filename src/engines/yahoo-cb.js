import { YahooDriver } from "./yahoo-driver.js";

export class YahooCbDriver extends YahooDriver {
  id = "yahoo_cb";
  backend = "cloakbrowser";
  pool = "engine";
  homeUrl = "https://search.yahoo.com/";
}
