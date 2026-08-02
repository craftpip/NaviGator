import { GoogleDriver } from "./google-driver.js";

export class GoogleChDriver extends GoogleDriver {
  id = "google_ch";
  backend = "chromium";
  pool = "engine";
  exposedInMcp = false;
  homeUrl = "https://www.google.com/";
}
