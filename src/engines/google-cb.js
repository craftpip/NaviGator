import { GoogleDriver } from "./google-driver.js";

export class GoogleCbDriver extends GoogleDriver {
  id = "google_cb";
  backend = "cloakbrowser";
  pool = "engine";
  exposedInMcp = true;
  homeUrl = "https://www.google.com/";
}
