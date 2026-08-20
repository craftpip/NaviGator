import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Navigator",
  description:
    "MCP server for web search, page extraction, screenshots, and browser automation",

  ignoreDeadLinks: true,

  head: [
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "",
      },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap",
      },
    ],
    ["link", { rel: "icon", href: "/navigator-logo.png" }],
    [
      "meta",
      {
        property: "og:title",
        content: "Navigator — MCP Browser Server",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Give your MCP client a real browser for web search, readable page extraction, screenshots, and browser automation.",
      },
    ],
    [
      "meta",
      {
        property: "og:image",
        content: "https://craftpip.github.io/navigator/og-image.png",
      },
    ],
  ],

  themeConfig: {
    logo: "/navigator-logo.png",
    siteTitle: "Navigator",

    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/guides/quick-start-docker" },
      { text: "Changelog", link: "/changelog" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Docker (recommended)", link: "/guides/quick-start-docker" },
          { text: "Or manual install (Node.js)", link: "/guides/quick-start-nodejs" },
          { text: "First Search", link: "/guides/first-search" },
          { text: "Client Configuration", link: "/guides/client-config" },
        ],
      },
      {
        text: "Search",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/search/overview" },
          { text: "Engines", link: "/guides/search/engines" },
          { text: "Results", link: "/guides/search/results" },
          { text: "Tips", link: "/guides/search/tips" },
        ],
      },
      {
        text: "Extraction",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/extraction/overview" },
          { text: "Extractor Formats", link: "/guides/extraction/formats" },
          { text: "Domain Hints", link: "/guides/extraction/domain-hints" },
          { text: "Link Navigation", link: "/guides/extraction/links" },
          { text: "AI Extractors", link: "/guides/extraction/ai-extractors" },
        ],
      },
      {
        text: "Screenshots",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/screenshots/overview" },
          { text: "ASCII Renders", link: "/guides/screenshots/ascii" },
          { text: "Output Options", link: "/guides/screenshots/output" },
        ],
      },
      {
        text: "DevTools",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/devtools/overview" },
          { text: "DOM Inspection", link: "/guides/devtools/dom" },
          { text: "Interaction", link: "/guides/devtools/interaction" },
          { text: "Network & Console", link: "/guides/devtools/network" },
        ],
      },
      {
        text: "Self-Hosting",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/self-hosting/overview" },
          { text: "Docker Configuration", link: "/guides/self-hosting/docker" },
          { text: "Environment Variables", link: "/guides/self-hosting/env-vars" },
          { text: "Security", link: "/guides/self-hosting/security" },
          { text: "Monitoring", link: "/guides/self-hosting/monitoring" },
        ],
      },
      {
        text: "Reference",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "All Tools", link: "/reference/tools" },
          { text: "Architecture", link: "/reference/architecture" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/craftpip/navigator" },
    ],

    search: {
      provider: "local",
    },

    editLink: {
      pattern:
        "https://github.com/craftpip/navigator/edit/main/website/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the Apache-2.0 License.",
      copyright: "Copyright © 2026 craftpip",
    },
  },
});
