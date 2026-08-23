import DefaultTheme from "vitepress/theme";
import LandingPage from "./components/LandingPage.vue";
import TabBar from "./components/TabBar.vue";
import Tabs from "./components/Tabs.vue";
import Tab from "./components/Tab.vue";
import TabShow from "./components/TabShow.vue";

import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: DefaultTheme.Layout,
  enhanceApp({ app, router }) {
    app.component("LandingPage", LandingPage);
    app.component("TabBar", TabBar);
    app.component("Tabs", Tabs);
    app.component("Tab", Tab);
    app.component("TabShow", TabShow);

    if (typeof window !== "undefined") {
      const updateHashTarget = () => {
        const hash = decodeURIComponent(window.location.hash.slice(1));
        document.querySelectorAll(".vp-doc :where(h1,h2,h3,h4,h5,h6).is-target").forEach((el) => el.classList.remove("is-target"));
        if (hash) {
          const el = document.getElementById(hash);
          if (el && el.matches("h1, h2, h3, h4, h5, h6")) el.classList.add("is-target");
        }
      };
      const scheduleUpdate = () => {
        updateHashTarget();
        // headings may not be in DOM yet on hard refresh (VitePress hydration) — retry briefly
        let tries = 0;
        const poll = () => {
          const hash = decodeURIComponent(window.location.hash.slice(1));
          if (hash && !document.getElementById(hash) && tries < 10) {
            tries++;
            setTimeout(() => {
              updateHashTarget();
              poll();
            }, 200);
          }
        };
        poll();
      };
      window.addEventListener("hashchange", scheduleUpdate);
      window.addEventListener("load", scheduleUpdate);
      if (router && router.onAfterRouteChanged) {
        router.onAfterRouteChanged(scheduleUpdate);
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scheduleUpdate);
      } else {
        scheduleUpdate();
      }
      // also catch clicks on header anchors (VitePress uses pushState without hashchange)
      document.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest("a.header-anchor");
        if (a && a.hash) setTimeout(scheduleUpdate, 50);
      });
    }
  },
};
