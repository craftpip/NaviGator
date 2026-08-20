<script setup>
import { useSharedTabs } from "./shared-tabs.js";

defineProps({
  value: { type: String, required: true },
});

const active = useSharedTabs();
</script>

<template>
  <div v-show="active === value" class="vp-tab-panel">
    <slot />
  </div>
</template>
