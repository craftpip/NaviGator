export const KNOWN_BACKENDS = new Set(["api", "cloakbrowser", "chromium", "lightpanda"]);
export const POOL_POLICIES = new Set(["engine", "shared"]);

export class SearchEngineDriver {
  id = "";
  backend = "api";
  pool = null;
  homeUrl = null;
  inputSelectors = [];
  resultSelectors = [];

  constructor(config = {}) {
    this.config = config;
  }

  get isBrowser() {
    return this.backend !== "api";
  }

  searchUrl(_query) {
    throw new Error(`${this.id} does not implement searchUrl()`);
  }

  async search(_params) {
    throw new Error(`${this.id} does not implement search()`);
  }

  async submit(_page, _query) {
    throw new Error(`${this.id} does not implement submit()`);
  }

  async extract(_page) {
    throw new Error(`${this.id} does not implement extract()`);
  }

  async assertNotBlocked(_page) {}
}
