<template>
  <div class="lp">

    <ForestCanvas />

    <section class="hero">
      <div class="hero-content">
        <span class="pill">MCP Server</span>
        <h1 class="title">Your AI's Web Browser</h1>
        <p class="subtitle">Search, read, and interact with the real web.</p>
        <p class="desc">
          Navigator gives your MCP client a real Chromium browser. Search across 12 engines,
          extract clean content from any page, capture screenshots, and drive live sessions —
          all through one self-hosted server that works with Claude, Cursor, OpenCode, and more.
        </p>
        <div class="ctas">
          <a href="/getting-started" class="cta-primary">
            Get Started
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <a href="https://github.com/craftpip/navigator" class="cta-secondary" target="_blank">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            GitHub
          </a>
        </div>
      </div>
    </section>

    <div class="shot-wrap">
      <div class="shot-frame">
        <img src="/console-dark.jpg" alt="Navigator console" class="shot-dark" />
        <img src="/console-light.jpg" alt="Navigator console" class="shot-light" />
      </div>
    </div>

    <section class="logos">
      <p class="logos-label">Works with your stack</p>
      <div class="logos-row">
        <span>Claude Desktop</span>
        <span class="sep">/</span>
        <span>OpenCode</span>
        <span class="sep">/</span>
        <span>Cursor</span>
        <span class="sep">/</span>
        <span>Windsurf</span>
        <span class="sep">/</span>
        <span>Any MCP Client</span>
      </div>
    </section>

    <section class="section features" ref="featuresRef">
      <div class="inner">
        <h2>Five tools. Zero setup.</h2>
        <p class="lead">Every capability your agent needs to navigate the real web.</p>
        <div class="grid-4">
          <div class="card" v-for="f in features" :key="f.name">
            <div class="card-icon" :style="{ background: f.bg, color: f.fg }" v-html="f.icon"></div>
            <h3>{{ f.name }}</h3>
            <p>{{ f.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section why" ref="whyRef">
      <div class="inner">
        <h2>Why Navigator</h2>
        <div class="grid-2">
          <div class="card" v-for="w in why" :key="w.title">
            <span class="tag" :style="{ background: w.bg, color: w.fg }">{{ w.tag }}</span>
            <h3>{{ w.title }}</h3>
            <p>{{ w.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section stats" ref="statsRef">
      <div class="stats-row">
        <div class="stat" v-for="s in stats" :key="s.label">
          <span class="stat-val">{{ s.val }}</span>
          <span class="stat-label">{{ s.label }}</span>
        </div>
      </div>
    </section>

    <section class="section install" ref="installRef">
      <div class="inner narrow">
        <h2>Running in 30 seconds</h2>
        <p class="lead">One container. One config line. Done.</p>
        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <div>
              <div class="step-title">Start the server</div>
              <pre><code>docker compose up -d</code></pre>
            </div>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <div>
              <div class="step-title">Connect your client</div>
              <pre><code>{
  "mcpServers": {
    "navigator": {
      "url": "http://localhost:3000/mcp"
    }
  }
}</code></pre>
            </div>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <div>
              <div class="step-title">Your agent is browsing</div>
              <pre><code>Search any engine. Read any page.
Screenshot any view. Click any button.</code></pre>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section cta-bottom" ref="ctaRef">
      <h2>Give your agents the real web.</h2>
      <p>Self-hosted. Private. Ship today.</p>
      <div class="ctas" style="margin-top:28px">
        <a href="/getting-started" class="cta-primary">
          Get Started
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a href="https://github.com/craftpip/navigator" class="cta-secondary" target="_blank">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          GitHub
        </a>
      </div>
    </section>

    <footer class="lp-foot">
      <span>Apache-2.0</span>
      <span class="dot">&middot;</span>
      <a href="https://github.com/craftpip/navigator">GitHub</a>
      <span class="dot">&middot;</span>
      <a href="/changelog">Changelog</a>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import ForestCanvas from './ForestCanvas.vue'

const featuresRef = ref(null)
const whyRef = ref(null)
const statsRef = ref(null)
const installRef = ref(null)
const ctaRef = ref(null)
let observer = null

onMounted(() => {
  const els = [featuresRef.value, whyRef.value, statsRef.value, installRef.value, ctaRef.value].filter(Boolean)
  observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('show'); observer.unobserve(e.target) }
    }
  }, { threshold: 0.1 })
  els.forEach(el => observer.observe(el))
})
onBeforeUnmount(() => observer?.disconnect())

const features = [
  {
    name: 'web_search',
    desc: 'Twelve routes across DuckDuckGo, Google, Bing, Brave, Mojeek. Circuit breakers swap engines instantly when one fails.',
    bg: '#eff6ff', fg: '#2563eb',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
  },
  {
    name: 'web_fetch',
    desc: 'Open any URL. Get clean readable text, tables, links with ref IDs your agent can follow deeper into the site.',
    bg: '#ecfdf5', fg: '#059669',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  },
  {
    name: 'web_page_screenshot',
    desc: 'Full-page or viewport. JPEG, base64, file, or URL. Your agent finally sees what a page actually looks like.',
    bg: '#f5f3ff', fg: '#7c3aed',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
  },
  {
    name: 'DevTools',
    desc: 'Nineteen CDP tools — DOM read/write, clicks, keystrokes, network, console, persistent browser tabs.',
    bg: '#fffbeb', fg: '#d97706',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>'
  },
]

const why = [
  {
    tag: 'Reliable',
    title: 'Multi-engine routing',
    desc: 'If DuckDuckGo trips, Google picks up. Twelve routes, four backends, circuit breakers — your agent never loses search.',
    bg: '#eff6ff', fg: '#2563eb',
  },
  {
    tag: 'Private',
    title: 'Self-hosted',
    desc: 'One Docker container on your machine. HTTP or stdio. Every search, page, and screenshot stays on your network.',
    bg: '#ecfdf5', fg: '#059669',
  },
  {
    tag: 'Smart',
    title: 'Domain hints',
    desc: 'Teach Navigator how to read specific sites — custom selectors, content flows for multi-step pages, per-domain rules.',
    bg: '#f5f3ff', fg: '#7c3aed',
  },
  {
    tag: 'Visible',
    title: 'Web console',
    desc: 'Live health dashboard, engine success rates, tab management, extraction testing, and hint editing at :3000/console.',
    bg: '#fffbeb', fg: '#d97706',
  },
]

const stats = [
  { val: '12', label: 'Search routes' },
  { val: '4', label: 'Browser backends' },
  { val: '19', label: 'DevTools commands' },
  { val: '30s', label: 'Time to first search' },
]
</script>

<style scoped>
.lp {
  position: relative;
  color: var(--lp-text);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  overflow-x: hidden;
}

.lp :deep(*) { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Hero ── */
.hero {
  position: relative;
  min-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 120px 24px 80px;
  background: transparent;
  z-index: 1;
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 640px;
}

.pill {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--lp-blue);
  background: var(--lp-blue-soft);
  padding: 5px 14px;
  border-radius: 100px;
  border: 1px solid color-mix(in srgb, var(--lp-blue) 15%, transparent);
  margin-bottom: 20px;
}

.title {
  font-size: clamp(3.2rem, 8vw, 6rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  margin-bottom: 20px;
  background: linear-gradient(135deg, var(--lp-text) 30%, var(--lp-blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 1.4rem;
  font-weight: 600;
  margin-bottom: 16px;
}

.desc {
  font-size: 1rem;
  line-height: 1.75;
  color: var(--lp-muted);
  margin-bottom: 32px;
}

.ctas {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.cta-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 22px;
  border-radius: 10px;
  background: var(--lp-blue);
  color: #fff;
  font: 600 14px "Inter", ui-sans-serif, system-ui, sans-serif;
  text-decoration: none;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(37,99,235,0.3);
}
.cta-primary:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(37,99,235,0.4);
}

.cta-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 22px;
  border-radius: 10px;
  background: var(--lp-surface);
  border: 1px solid var(--lp-border);
  color: var(--lp-text);
  font: 600 14px "Inter", ui-sans-serif, system-ui, sans-serif;
  text-decoration: none;
  transition: all 0.2s;
}
.cta-secondary:hover {
  background: var(--lp-border);
  transform: translateY(-1px);
}

/* ── Screenshot contained ── */
.shot-wrap {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
  position: relative;
  z-index: 2;
}
.shot-frame {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--lp-border);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  line-height: 0;
  background: var(--lp-surface);
}
html.dark .shot-frame {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}
.shot-frame img {
  width: 100%;
  display: block;
}

/* ── Logos ── */
.logos {
  text-align: center;
  padding: 56px 24px 0;
}
.logos-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--lp-muted);
  margin-bottom: 14px;
}
.logos-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--lp-text);
  opacity: 0.55;
}
.sep { opacity: 0.3; }

/* ── Sections ── */
.section { padding: 80px 24px 0; }
.inner { max-width: 1040px; margin: 0 auto; }
.inner.narrow { max-width: 640px; }

.section h2 {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-align: center;
  margin-bottom: 8px;
}
.lead {
  text-align: center;
  color: var(--lp-muted);
  font-size: 1rem;
  margin-bottom: 40px;
}

/* ── Feature grid ── */
.grid-4 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.card {
  padding: 28px;
  border-radius: 12px;
  background: var(--lp-surface);
  border: 1px solid var(--lp-border);
  transition: transform 0.2s, box-shadow 0.2s;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px -8px rgba(0,0,0,0.08);
}
html.dark .card:hover {
  box-shadow: 0 8px 30px -8px rgba(0,0,0,0.4);
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.card h3 {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.card p {
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--lp-muted);
}

/* ── Why grid ── */
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}
.tag {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: 5px;
  margin-bottom: 12px;
}

/* ── Stats ── */
.stats {
  padding: 64px 24px;
}
.stats-row {
  max-width: 800px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  text-align: center;
  border-top: 1px solid var(--lp-border);
  border-bottom: 1px solid var(--lp-border);
  padding: 48px 0;
}
.stat-val {
  display: block;
  font-size: 2.2rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, var(--lp-blue), var(--lp-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.stat-label {
  display: block;
  font-size: 0.78rem;
  color: var(--lp-muted);
  margin-top: 2px;
}

/* ── Install steps ── */
.steps { display: flex; flex-direction: column; gap: 18px; }
.step {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.step-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--lp-blue);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}
.step-title {
  font-size: 0.88rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.step pre {
  background: var(--lp-code-bg);
  color: var(--lp-code-text);
  padding: 14px 18px;
  border-radius: 8px;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  overflow-x: auto;
}

/* ── Bottom CTA ── */
.cta-bottom {
  text-align: center;
  padding: 80px 24px;
}
.cta-bottom h2 {
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.cta-bottom p {
  color: var(--lp-muted);
  margin-top: 4px;
}

/* ── Footer ── */
.lp-foot {
  text-align: center;
  padding: 28px 24px;
  border-top: 1px solid var(--lp-border);
  font-size: 0.78rem;
  color: var(--lp-muted);
  display: flex;
  gap: 8px;
  justify-content: center;
}
.lp-foot a {
  color: var(--lp-muted);
  text-decoration: none;
  transition: color 0.15s;
}
.lp-foot a:hover { color: var(--lp-text); }
.dot { opacity: 0.3; }

/* ── Scroll reveal ── */
.section {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.section.show {
  opacity: 1;
  transform: translateY(0);
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .hero { min-height: auto; padding: 100px 20px 60px; }
  .title { font-size: 2.6rem; }
  .subtitle { font-size: 1.15rem; }
  .grid-4, .grid-2 { grid-template-columns: 1fr; }
  .stats-row { grid-template-columns: repeat(2, 1fr); gap: 28px; }
}
</style>
