<template>
  <canvas ref="canvas" class="particle-canvas" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvas = ref(null)
let cleanup = null

onMounted(() => {
  const c = canvas.value
  const ctx = c.getContext('2d')
  let animId
  let particles = []
  let mouse = { x: -9999, y: -9999 }
  const PARTICLE_COUNT = 60
  const CONNECT_DIST = 140
  const MOUSE_RADIUS = 200

  function isDark() {
    return document.documentElement.classList.contains('dark')
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1
    const rect = c.parentElement.getBoundingClientRect()
    c.width = rect.width * dpr
    c.height = rect.height * dpr
    c.style.width = rect.width + 'px'
    c.style.height = rect.height + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    initParticles()
  }

  function initParticles() {
    const w = parseFloat(c.style.width)
    const h = parseFloat(c.style.height)
    particles = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.4 + 0.6,
      })
    }
  }

  function animate() {
    const w = parseFloat(c.style.width)
    const h = parseFloat(c.style.height)
    const dark = isDark()

    ctx.clearRect(0, 0, w, h)

    const pCol = dark ? [96, 165, 250] : [37, 99, 235]

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0 || p.x > w) { p.vx *= -1; p.x = Math.max(0, Math.min(w, p.x)) }
      if (p.y < 0 || p.y > h) { p.vy *= -1; p.y = Math.max(0, Math.min(h, p.y)) }
    }

    // connection lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < CONNECT_DIST) {
          const alpha = (1 - d / CONNECT_DIST) * (dark ? 0.15 : 0.07)
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = `rgba(${pCol[0]},${pCol[1]},${pCol[2]},${alpha})`
          ctx.lineWidth = 0.6
          ctx.stroke()
        }
      }
    }

    // mouse lines
    for (const p of particles) {
      const dx = mouse.x - p.x
      const dy = mouse.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < MOUSE_RADIUS) {
        const alpha = (1 - d / MOUSE_RADIUS) * (dark ? 0.25 : 0.12)
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(mouse.x, mouse.y)
        ctx.strokeStyle = `rgba(${pCol[0]},${pCol[1]},${pCol[2]},${alpha})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
    }

    // dots
    for (const p of particles) {
      const dx = mouse.x - p.x
      const dy = mouse.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy)
      const glow = d < MOUSE_RADIUS ? (1 - d / MOUSE_RADIUS) * 0.5 : 0
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r + glow, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${pCol[0]},${pCol[1]},${pCol[2]},${0.3 + glow * 0.5})`
      ctx.fill()
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
.particle-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
