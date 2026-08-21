<script setup>
import { useSharedTabs } from "./shared-tabs.js";

const props = defineProps({
  value: { type: String, required: true },
  group: { type: String, default: "install" },
});

const active = useSharedTabs(props.group);
</script>

<template>
  <div v-show="active === value">
    <slot />
  </div>
</template>