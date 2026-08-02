import { BingDriver } from "./bing-driver.js";

export class BingCbDriver extends BingDriver {
  id = "bing_cb";
  backend = "cloakbrowser";
  pool = "engine";
  exposedInMcp = true;
  homeUrl = "https://www.bing.com/";
}
