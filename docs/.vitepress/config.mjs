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
      { text: "Docs", link: "/guides/getting-started" },
      { text: "Changelog", link: "/changelog" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Getting Started", link: "/guides/getting-started" },
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
          { text: "Formats", link: "/guides/extraction/formats" },
          { text: "Links", link: "/guides/extraction/links" },
          { text: "AI Extractors", link: "/guides/extraction/ai-extractors" },
          { text: "Domain Hints", link: "/guides/extraction/domain-hints" },
        ],
      },
      {
        text: "Screenshots",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/screenshots/overview" },
          { text: "Output", link: "/guides/screenshots/output" },
          { text: "ASCII Screenshot", link: "/guides/screenshots/ascii" },
        ],
      },
      {
        text: "DevTools",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/devtools/overview" },
          { text: "DOM", link: "/guides/devtools/dom" },
          { text: "Network", link: "/guides/devtools/network" },
          { text: "Interaction", link: "/guides/devtools/interaction" },
        ],
      },
      {
        text: "Self-Hosting",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/guides/self-hosting/overview" },
          { text: "Docker", link: "/guides/self-hosting/docker" },
          { text: "Environment Variables", link: "/guides/self-hosting/env-vars" },
          { text: "Monitoring", link: "/guides/self-hosting/monitoring" },
          { text: "Security", link: "/guides/self-hosting/security" },
        ],
      },
      {
        text: "API",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "MCP and HTTP", link: "/api/mcp-and-http" },
          { text: "Tool Reference", link: "/api/tool-reference" },
        ],
      },
      {
        text: "Architecture",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Overview", link: "/architecture/overview" },
          { text: "Browser Runtime and DevTools", link: "/architecture/browser-runtime" },
        ],
      },
      {
        text: "Code",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Core Server and Search", link: "/code/core-server-search" },
          { text: "Browser and DevTools", link: "/code/browser-and-devtools" },
          { text: "Search Drivers", link: "/code/search-drivers" },
          { text: "Support Modules", link: "/code/support-modules" },
          { text: "Runtime and Tests", link: "/code/runtime-and-tests" },
        ],
      },
      {
        text: "Operations",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Operations and Configuration", link: "/operations/operations-and-configuration" },
        ],
      },
      {
        text: "Reference",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Source Map", link: "/reference/source-reference" },
        ],
      },
      {
        text: "Archive",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "ASCII Screenshot", link: "/archive/ascii-screenshot" },
          { text: "Domain Hint Reference", link: "/archive/domain-hints-reference" },
          { text: "Web Fetch Reference", link: "/archive/web-fetch-reference" },
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
        "https://github.com/craftpip/navigator/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the Apache-2.0 License.",
      copyright: "Copyright © 2026 craftpip",
    },
  },
});
