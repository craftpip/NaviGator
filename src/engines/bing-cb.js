import { BingDriver } from "./bing-driver.js";

export class BingCbDriver extends BingDriver {
  id = "bing_cb";
  backend = "cloakbrowser";
  pool = "engine";
  homeUrl = "https://www.bing.com/";
}
