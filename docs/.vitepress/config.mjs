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
        text: "Extraction",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Extraction and Hints", link: "/extraction/extraction-and-hints" },
          { text: "MinerU-HTML Sidecar", link: "/extraction/navigator-mineru-sidecar" },
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
        text: "Search",
        collapsible: true,
        collapsed: true,
        items: [
          { text: "Search and Drivers", link: "/search/search-and-drivers" },
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
