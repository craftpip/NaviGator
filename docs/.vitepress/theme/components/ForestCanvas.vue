<template>
  <canvas ref="canvasRef" class="page-canvas" aria-hidden="true" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvasRef = ref(null)
let intervalId = null
let resizeObserver = null

onMounted(() => {
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  let width = 0
  let height = 0

  const resize = () => {
    const bounds = canvas.parentElement.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    width = bounds.width
    height = bounds.height
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  resize()
  window.addEventListener('resize', resize)
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas.parentElement)

  const waves = Array.from({ length: 6 }, (_, index) => ({
    yBase: 0.15 + (0.7 * index / 5),
    amp: 20 + Math.random() * 30,
    freq: 0.0015 + Math.random() * 0.002,
    speed: 0.008 + Math.random() * 0.012,
    phase: Math.random() * Math.PI * 2,
    hue: 120 + index * 15,
    alpha: 0.06 + Math.random() * 0.04,
  }))
  let frame = 0

  intervalId = window.setInterval(() => {
    ctx.clearRect(0, 0, width, height)
    const dark = document.documentElement.classList.contains('dark')

    for (const wave of waves) {
      ctx.beginPath()
      ctx.moveTo(0, height)
      for (let x = 0; x <= width; x += 3) {
        const y = height * wave.yBase
          + Math.sin(x * wave.freq + frame * wave.speed + wave.phase) * wave.amp
          + Math.sin(x * wave.freq * 2.3 + frame * wave.speed * 0.7) * wave.amp * 0.3
        ctx.lineTo(x, y)
      }
      ctx.lineTo(width, height)
      ctx.closePath()
      const hue = dark ? wave.hue : wave.hue - 10
      ctx.fillStyle = `hsla(${hue},50%,40%,${wave.alpha})`
      ctx.fill()
    }

    frame++
  }, 33)

  onBeforeUnmount(() => {
    if (intervalId) window.clearInterval(intervalId)
    window.removeEventListener('resize', resize)
    resizeObserver?.disconnect()
  })
})
</script>

<style scoped>
.page-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
</style>
