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
  enhanceApp({ app }) {
    app.component("LandingPage", LandingPage);
    app.component("TabBar", TabBar);
    app.component("Tabs", Tabs);
    app.component("Tab", Tab);
    app.component("TabShow", TabShow);
  },
};
