<template>
  <canvas ref="canvasRef" class="page-canvas" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvasRef = ref(null)
let intervalId = null

onMounted(() => {
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  let w, h

  const dpr = window.devicePixelRatio || 1
  function resize() {
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const isDark = () => document.documentElement.classList.contains('dark')

  const NUM_WAVES = 6
  const waves = []
  for (let i = 0; i < NUM_WAVES; i++) {
    waves.push({
      yBase: 0.15 + (0.7 * i / (NUM_WAVES - 1)),
      amp: 20 + Math.random() * 30,
      freq: 0.0015 + Math.random() * 0.002,
      speed: 0.008 + Math.random() * 0.012,
      phase: Math.random() * Math.PI * 2,
      hue: 120 + i * 15,
      alpha: 0.06 + Math.random() * 0.04,
    })
  }

  let frame = 0

  function tick() {
    try {
      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < waves.length; i++) {
        const wv = waves[i]
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 3) {
          const y = h * wv.yBase
            + Math.sin(x * wv.freq + frame * wv.speed + wv.phase) * wv.amp
            + Math.sin(x * wv.freq * 2.3 + frame * wv.speed * 0.7) * wv.amp * 0.3
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        const hue = isDark() ? wv.hue : wv.hue - 10
        ctx.fillStyle = 'hsla(' + hue + ',50%,40%,' + wv.alpha + ')'
        ctx.fill()
      }

      frame++
    } catch (e) {
      console.error('Canvas error:', e)
    }
  }

  intervalId = setInterval(tick, 33)

  onBeforeUnmount(() => {
    if (intervalId) clearInterval(intervalId)
    window.removeEventListener('resize', resize)
  })
})
</script>

<style scoped>
.page-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
}
</style>
