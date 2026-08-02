import { SearchEngineDriver } from "./driver.js";

export class ApiSearchDriver extends SearchEngineDriver {
  backend = "api";
  pool = null;
  homeUrl = null;
}
