<template>
  <canvas ref="canvas" class="aurora-canvas" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvas = ref(null)
let cleanup = null

onMounted(() => {
  const c = canvas.value
  const ctx = c.getContext('2d')
  let animId
  let w, h
  let mouse = { x: -9999, y: -9999 }
  const t0 = performance.now()

  // Aurora blobs — each has position, velocity, radius, hue offset
  const BLOBS = [
    { x: 0.3, y: 0.4, r: 0.35, speed: 0.00015, hueOff: 0,    vx: 0.2, vy: 0.3 },
    { x: 0.7, y: 0.3, r: 0.30, speed: 0.00020, hueOff: 60,   vx: -0.3, vy: 0.2 },
    { x: 0.5, y: 0.6, r: 0.28, speed: 0.00012, hueOff: 200,  vx: 0.15, vy: -0.25 },
    { x: 0.2, y: 0.7, r: 0.25, speed: 0.00018, hueOff: 280,  vx: -0.2, vy: -0.15 },
    { x: 0.8, y: 0.6, r: 0.22, speed: 0.00025, hueOff: 140,  vx: 0.25, vy: 0.15 },
  ]

  function isDark() {
    return document.documentElement.classList.contains('dark')
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = c.parentElement.getBoundingClientRect()
    w = rect.width
    h = rect.height
    c.width = w * dpr
    c.height = h * dpr
    c.style.width = w + 'px'
    c.style.height = h + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function animate() {
    const dark = isDark()
    const t = performance.now() - t0

    ctx.clearRect(0, 0, w, h)

    // Background
    ctx.fillStyle = dark ? '#09090b' : '#ffffff'
    ctx.fillRect(0, 0, w, h)

    // Mouse influence (subtle displacement)
    const mx = mouse.x / w
    const my = mouse.y / h

    // Draw aurora blobs
    ctx.globalCompositeOperation = dark ? 'screen' : 'multiply'

    for (const blob of BLOBS) {
      const bx = (blob.x + Math.sin(t * blob.speed + blob.vy) * 0.15 + mx * 0.05) * w
      const by = (blob.y + Math.cos(t * blob.speed * 0.7 + blob.vx) * 0.12 + my * 0.04) * h
      const br = blob.r * Math.min(w, h)

      const hue = blob.hueOff + Math.sin(t * 0.0001) * 20
      const sat = dark ? '70%' : '50%'
      const light = dark ? '45%' : '70%'
      const alpha = dark ? 0.25 : 0.15

      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br)
      grad.addColorStop(0, `hsla(${hue}, ${sat}, ${light}, ${alpha})`)
      grad.addColorStop(0.5, `hsla(${hue + 20}, ${sat}, ${light}, ${alpha * 0.4})`)
      grad.addColorStop(1, `hsla(${hue + 40}, ${sat}, ${light}, 0)`)

      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
    }

    ctx.globalCompositeOperation = 'source-over'

    // Subtle grid lines (very faint)
    const gridAlpha = dark ? 0.04 : 0.03
    ctx.strokeStyle = dark
      ? `rgba(255,255,255,${gridAlpha})`
      : `rgba(0,0,0,${gridAlpha})`
    ctx.lineWidth = 0.5
    const gridSize = 60
    for (let x = 0; x <= w; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y <= h; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    // Floating dots along grid intersections (subtle sparkle)
    const dotAlpha = dark ? 0.12 : 0.06
    ctx.fillStyle = dark
      ? `rgba(147,197,253,${dotAlpha})`
      : `rgba(37,99,235,${dotAlpha})`
    for (let x = 0; x <= w; x += gridSize) {
      for (let y = 0; y <= h; y += gridSize) {
        const pulse = Math.sin(t * 0.001 + x * 0.01 + y * 0.01) * 0.5 + 0.5
        if (pulse > 0.7) {
          const r = 1 + pulse * 1.5
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    animId = requestAnimationFrame(animate)
  }

  function onMouse(e) {
    const rect = c.getBoundingClientRect()
    mouse.x = e.clientX - rect.left
    mouse.y = e.clientY - rect.top
  }

  function onMouseLeave() {
    mouse.x = -9999
    mouse.y = -9999
  }

  function onResize() { resize() }

  window.addEventListener('resize', onResize)
  c.addEventListener('mousemove', onMouse)
  c.addEventListener('mouseleave', onMouseLeave)

  resize()
  animate()

  cleanup = () => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', onResize)
    c.removeEventListener('mousemove', onMouse)
    c.removeEventListener('mouseleave', onMouseLeave)
  }
})

onBeforeUnmount(() => { if (cleanup) cleanup() })
</script>

<style scoped>
.aurora-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
