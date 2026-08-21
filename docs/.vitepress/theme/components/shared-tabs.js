import { ref, watch } from "vue";

const groups = {};

function readParam(key) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

function updateURL(key, val) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(key, val);
  window.history.replaceState(null, "", url);
}

/* Publish the active tab as a data attribute on <html> so CSS can style
 * outside the tab components — e.g. hide a tab-gated heading's TOC entry
 * when its tab is inactive. TabShow uses v-show (not v-if), so the heading
 * always exists in the DOM and VitePress builds its TOC + scroll-spy from it
 * at page load; the data attribute only controls link visibility, keeping
 * VitePress's own rendering (styles, active highlight) intact. */
function syncHtmlAttr(group, val) {
  if (typeof window === "undefined") return;
  if (val) document.documentElement.dataset[group] = val;
  else delete document.documentElement.dataset[group];
}

export function useSharedTabs(group = "install") {
  if (!groups[group]) {
    const fallbacks = { install: "docker", client: "universal" };
    const initial = readParam(group) || fallbacks[group] || null;
    const r = ref(initial);
    groups[group] = r;
    syncHtmlAttr(group, r.value);
    watch(r, (val) => {
      updateURL(group, val);
      syncHtmlAttr(group, val);
    });
  }
  return groups[group];
}