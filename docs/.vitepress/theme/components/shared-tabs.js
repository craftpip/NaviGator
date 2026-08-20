import { ref, watch } from "vue";

function readParam() {
  if (typeof window === "undefined") return "docker";
  return new URLSearchParams(window.location.search).get("install") || "docker";
}

const active = ref("docker");

if (typeof window !== "undefined") {
  active.value = readParam();
  watch(active, (val) => {
    const url = new URL(window.location.href);
    url.searchParams.set("install", val);
    window.history.replaceState(null, "", url);
  });
}

export function useSharedTabs() {
  return active;
}
