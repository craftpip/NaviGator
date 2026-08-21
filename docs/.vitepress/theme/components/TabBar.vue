<script setup>
import { useSharedTabs } from "./shared-tabs.js";

const props = defineProps({
  values: { type: String, required: true },
  labels: { type: String, required: true },
  group: { type: String, default: "install" },
});

const items = props.values.split(",").map((v, i) => ({
  value: v.trim(),
  label: (props.labels.split(",")[i] || v).trim(),
}));

const active = useSharedTabs(props.group);
</script>

<template>
  <div class="vp-tab-bar" :class="`vp-tabs-group-${group}`">
    <button
      v-for="item in items"
      :key="item.value"
      :class="['vp-tab-btn', { active: active === item.value }]"
      @click="active = item.value"
    >
      {{ item.label }}
    </button>
  </div>
</template>
