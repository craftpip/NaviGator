<script setup>
import { useSharedTabs } from "./shared-tabs.js";

const props = defineProps({
  values: { type: String, required: true },
  labels: { type: String, required: true },
});

const items = props.values.split(",").map((v, i) => ({
  value: v.trim(),
  label: (props.labels.split(",")[i] || v).trim(),
}));

const active = useSharedTabs();
</script>

<template>
  <div class="vp-tab-bar">
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
