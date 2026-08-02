import { SearchEngineDriver } from "./driver.js";

export class BrowserSearchDriver extends SearchEngineDriver {
  async submit(page, query) {
    const { config } = this;
    await page.goto(this.searchUrl(query), {
      waitUntil: "domcontentloaded",
      timeout: config.browserOpTimeoutMs
    });

    await page.waitForSelector("body", { timeout: config.browserOpTimeoutMs }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    await this.waitForAnySelector(page, this.resultSelectors, config.browserOpTimeoutMs);
  }

  async waitForAnySelector(page, selectors, timeout) {
    await this.assertNotBlocked(page);
    try {
      await Promise.any(selectors.map((selector) => page.waitForSelector(selector, { timeout })));
    } catch (error) {
      await this.assertNotBlocked(page);
      throw error;
    }

    for (const selector of selectors) {
      const handle = await page.$(selector);
      if (handle) return handle;
    }

    throw new Error(`Could not resolve any selector: ${selectors.join(", ")}`);
  }
}
