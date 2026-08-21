<script setup>
defineProps({
  group: { type: String, default: "install" },
});
</script>

<template>
  <div :class="['vp-tabs-content', `vp-tabs-group-${group}`]">
    <slot />
  </div>
</template>
