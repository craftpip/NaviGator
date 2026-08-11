import { BingDriver } from "./bing-driver.js";

export class BingLpDriver extends BingDriver {
  id = "bing_lp";
  backend = "lightpanda";
  pool = "shared";
  homeUrl = "https://www.bing.com/";
}
