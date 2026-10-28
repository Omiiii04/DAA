import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Activity, TrendingUp, Zap, Database, BarChart2,
  FileText, Brain, Timer, ArrowRight, ChevronRight, Cpu,
} from 'lucide-react'

/* ─── Framer Motion Variants ────────────────────────────────────────────── */
const springConfig = { type: 'spring', bounce: 0, duration: 0.4 }

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0, duration: 0.5 } },
}

const staticVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
}

/* ─── Algorithm data ─────────────────────────────────────────────────────── */
const ALGORITHMS = [
  {
    name: 'Brute Force',
    complexity: 'O(N²)',
    color: 'var(--algo-bf)',
    colorDim: 'rgba(197, 34, 31, 0.10)',
    description: 'Exhaustive pairwise comparison. Guarantees correctness at quadratic cost. Establishes a correctness baseline for benchmarking.',
    badge: 'badge-danger',
  },
  {
    name: 'Divide & Conquer',
    complexity: 'O(N log N)',
    color: 'var(--algo-dc)',
    colorDim: 'rgba(180, 83, 9, 0.10)',
    description: 'Recursive partitioning across midpoints. Balances accuracy with logarithmic overhead — the classic textbook approach.',
    badge: 'badge-warning',
  },
  {
    name: "Kadane's Algorithm",
    complexity: 'O(N)',
    color: 'var(--algo-kadane)',
    colorDim: 'rgba(4, 120, 87, 0.10)',
    description: 'Linear scan dynamic programming. Single-pass, O(1) space. The theoretical optimum for maximum subarray problems.',
    badge: 'badge-success',
  },
]

/* ─── Feature data ───────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: BarChart2,
    label: 'Statistical Benchmarking',
    desc: 'Mean, median, std dev across 10 iterations. Rigorous statistical profiling per dataset size.',
    color: 'var(--accent)',
  },
  {
    icon: TrendingUp,
    label: 'Empirical Complexity',
    desc: 'Fit theoretical Big-O curves against measured growth rates with R² goodness-of-fit.',
    color: 'var(--algo-kadane)',
  },
  {
    icon: Database,
    label: 'Real Market Data',
    desc: 'Upload CSV / XLSX historical price series. Supports OHLCV format and custom date ranges.',
    color: 'var(--algo-dc)',
  },
  {
    icon: Brain,
    label: 'ML Integration',
    desc: 'Isolation Forest, K-Means clustering, and Gradient Boosting for anomaly & regime detection.',
    color: 'var(--accent)',
  },
  {
    icon: FileText,
    label: 'PDF Reports',
    desc: 'Export academic-grade analysis reports with charts, tables, and methodology sections.',
    color: 'var(--algo-bf)',
  },
  {
    icon: Zap,
    label: 'Interactive Charts',
    desc: 'Recharts-powered visualizations with hover tooltips, zoom, and synchronized comparison.',
    color: 'var(--algo-dc)',
  },
]

/* ─── Tech stack ─────────────────────────────────────────────────────────── */
const TECH = ['FastAPI', 'React 18', 'SQLite', 'Recharts', 'Framer Motion', 'Python 3.12+']

/* ══════════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const iv = shouldReduceMotion ? staticVariants : itemVariants
  const cv = shouldReduceMotion ? { hidden: {}, visible: { transition: { staggerChildren: 0 } } } : containerVariants

  function launch() {
    navigate('/')
  }

  return (
    <>
      {/* ── Inline Styles ─────────────────────────────────────────────────── */}
      <style>{`
        /* Landing page scoped styles */
        .landing-root {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text-primary);
          font-family: var(--font-sans);
          overflow-x: hidden;
        }

        /* Animated grid background */
        .landing-hero-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(var(--divider) 1px, transparent 1px),
            linear-gradient(90deg, var(--divider) 1px, transparent 1px);
          background-size: 48px 48px;
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
          opacity: 0.6;
          pointer-events: none;
        }

        /* Translucent glass navbar */
        .landing-navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          height: 60px;
          display: flex;
          align-items: center;
          padding: 0 24px;
          gap: 16px;
          border-bottom: 1px solid var(--divider);
          /* Glass effect */
          background: color-mix(in srgb, var(--bg) 75%, transparent);
        }
        @supports (backdrop-filter: blur(20px)) {
          .landing-navbar {
            background: color-mix(in srgb, var(--bg) 70%, transparent);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
          }
        }

        /* Nav brand link */
        .landing-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          cursor: pointer;
          flex: 1;
        }

        /* Hero section */
        .landing-hero {
          position: relative;
          min-height: calc(100vh - 60px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 24px 64px;
          overflow: hidden;
        }

        /* Display headline */
        .landing-headline {
          font-size: clamp(2.5rem, 5vw + 1rem, 4.5rem);
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          font-optical-sizing: auto;
          max-width: 820px;
          margin-bottom: 20px;
        }

        .landing-headline-accent {
          color: var(--accent);
        }

        /* Subheadline */
        .landing-subheadline {
          font-size: clamp(1rem, 1.5vw + 0.5rem, 1.25rem);
          line-height: 1.65;
          letter-spacing: 0;
          color: var(--text-secondary);
          max-width: 600px;
          margin-bottom: 36px;
        }

        /* CTA row */
        .landing-cta-row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 44px;
        }

        /* Primary landing CTA */
        .landing-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: var(--accent);
          color: var(--accent-ink);
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 0.9375rem;
          cursor: pointer;
          text-decoration: none;
          min-height: 48px;
          box-shadow: 0 4px 20px var(--accent-shadow);
          transition-property: background-color, box-shadow, transform;
          transition-duration: 150ms;
          transition-timing-function: ease-out;
          user-select: none;
        }

        @media (hover: hover) {
          .landing-btn-primary:hover {
            background: var(--accent-light);
            box-shadow: 0 6px 24px var(--accent-shadow);
          }
        }

        /* Ghost / secondary CTA */
        .landing-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: var(--surface);
          color: var(--text-primary);
          border: 1px solid var(--btn-border);
          border-radius: var(--radius-md);
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 0.9375rem;
          cursor: pointer;
          text-decoration: none;
          min-height: 48px;
          box-shadow: var(--shadow-raised-sm);
          transition-property: background-color, box-shadow, color, transform;
          transition-duration: 150ms;
          transition-timing-function: ease-out;
          user-select: none;
        }

        @media (hover: hover) {
          .landing-btn-ghost:hover {
            box-shadow: var(--shadow-raised);
            color: var(--accent);
          }
        }

        /* Stat pills row */
        .landing-stats-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .landing-stat-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: var(--accent-subtle);
          border: 1px solid var(--accent-subtle);
          border-radius: var(--radius-full);
          font-family: var(--font-mono);
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--accent);
          white-space: nowrap;
        }

        /* Section layout */
        .landing-section {
          padding: 80px 24px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .landing-section-header {
          text-align: center;
          margin-bottom: 56px;
        }

        .landing-section-title {
          font-size: clamp(1.5rem, 3vw, 2.25rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          font-optical-sizing: auto;
          margin-bottom: 10px;
        }

        .landing-section-sub {
          font-size: 1rem;
          color: var(--text-secondary);
          line-height: 1.65;
        }

        /* Algorithm cards */
        .algo-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .algo-card {
          background: var(--surface);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-md);
          padding: 28px 24px;
          box-shadow: var(--shadow-raised);
          position: relative;
          overflow: hidden;
          transition-property: box-shadow, transform;
          transition-duration: 200ms;
          transition-timing-function: ease-out;
        }

        @media (hover: hover) {
          .algo-card:hover {
            box-shadow: var(--shadow-raised-hover);
          }
        }

        /* Complexity badge */
        .complexity-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: var(--radius-full);
          font-family: var(--font-mono);
          font-size: 0.8125rem;
          font-weight: 700;
          margin-bottom: 16px;
        }

        /* Feature grid */
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }

        .feature-card {
          background: var(--surface);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-md);
          padding: 24px;
          box-shadow: var(--shadow-raised-sm);
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition-property: box-shadow, transform;
          transition-duration: 200ms;
          transition-timing-function: ease-out;
        }

        @media (hover: hover) {
          .feature-card:hover {
            box-shadow: var(--shadow-raised);
          }
        }

        .feature-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* Tech stack section */
        .landing-tech-section {
          padding: 48px 24px;
          border-top: 1px solid var(--divider);
          border-bottom: 1px solid var(--divider);
          text-align: center;
        }

        .landing-tech-label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin-bottom: 20px;
        }

        .tech-pills-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .tech-pill {
          padding: 7px 16px;
          background: var(--surface);
          border: 1px solid var(--divider);
          border-radius: var(--radius-full);
          font-family: var(--font-mono);
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          box-shadow: var(--shadow-raised-sm);
          transition-property: box-shadow, color;
          transition-duration: 150ms;
          transition-timing-function: ease-out;
        }

        @media (hover: hover) {
          .tech-pill:hover {
            color: var(--text-primary);
            box-shadow: var(--shadow-raised);
          }
        }

        /* Footer CTA section */
        .landing-footer-cta {
          padding: 80px 24px;
          text-align: center;
          background: var(--surface-well);
        }

        .landing-footer-cta-title {
          font-size: clamp(1.75rem, 3vw, 2.5rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          color: var(--text-primary);
          font-optical-sizing: auto;
          margin-bottom: 12px;
        }

        .landing-footer-cta-sub {
          font-size: 1rem;
          color: var(--text-secondary);
          margin-bottom: 36px;
          line-height: 1.65;
        }

        /* DAA badge in navbar */
        .daa-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          background: var(--accent-subtle);
          border: 1px solid var(--accent-subtle);
          border-radius: var(--radius-full);
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--accent);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* Divider between navbar items */
        .nav-spacer { flex: 1; }

        /* Radial glow behind hero text */
        .hero-glow {
          position: absolute;
          top: -10%;
          left: 50%;
          transform: translateX(-50%);
          width: 700px;
          height: 500px;
          background: radial-gradient(ellipse at center, var(--accent-subtle) 0%, transparent 70%);
          pointer-events: none;
          opacity: 0.7;
        }

        /* Reduced motion: remove all motion from landing */
        @media (prefers-reduced-motion: reduce) {
          .landing-btn-primary,
          .landing-btn-ghost,
          .algo-card,
          .feature-card,
          .tech-pill {
            transition-duration: 0.01ms !important;
          }
        }

        /* No-transition utility applied during theme switch */
        html.no-transition .landing-navbar,
        html.no-transition * {
          transition-duration: 0.01ms !important;
        }
      `}</style>

      <div className="landing-root">

        {/* ── Navbar ──────────────────────────────────────────────────────── */}
        <nav className="landing-navbar" role="navigation" aria-label="Landing navigation">
          {/* Brand */}
          <div
            className="landing-brand"
            onClick={launch}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && launch()}
            aria-label="Stock Peak Analyzer home"
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              boxShadow: '0 3px 10px var(--accent-shadow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Activity size={18} color="var(--accent-ink)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
                Stock Peak Analyzer
              </div>
            </div>
            <span className="daa-badge">DAA Project</span>
          </div>

          <div className="nav-spacer" />

          {/* Nav CTA */}
          <motion.button
            type="button"
            className="landing-btn-primary"
            style={{ padding: '9px 20px', fontSize: '0.875rem', minHeight: 40 }}
            onClick={launch}
            whileTap={{ scale: 0.96 }}
            transition={springConfig}
          >
            Launch App
            <ArrowRight size={16} color="currentColor" />
          </motion.button>
        </nav>

        {/* ── Hero Section ─────────────────────────────────────────────────── */}
        <section className="landing-hero" aria-labelledby="hero-headline">
          {/* Grid background */}
          <div className="landing-hero-bg" aria-hidden="true" />
          {/* Radial glow */}
          <div className="hero-glow" aria-hidden="true" />

          <motion.div
            variants={cv}
            initial="hidden"
            animate="visible"
            style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            {/* Pre-headline pill */}
            <motion.div variants={iv}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--divider)',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                marginBottom: 24,
                boxShadow: 'var(--shadow-raised-sm)',
              }}>
                <Cpu size={12} color="currentColor" />
                Academic DAA Research Tool · v2.0
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              id="hero-headline"
              className="landing-headline"
              variants={iv}
            >
              Algorithmic Analysis of{' '}
              <span className="landing-headline-accent">Financial Time Series</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p className="landing-subheadline" variants={iv}>
              Compare Brute Force, Divide & Conquer, and Kadane's Algorithm with
              statistical benchmarking on real and synthetic market data.
            </motion.p>

            {/* CTAs */}
            <motion.div className="landing-cta-row" variants={iv}>
              <motion.button
                type="button"
                className="landing-btn-primary"
                onClick={launch}
                whileTap={{ scale: 0.96 }}
                transition={springConfig}
              >
                Launch App
                <ArrowRight size={16} color="currentColor" />
              </motion.button>

              <motion.a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="landing-btn-ghost"
                whileTap={{ scale: 0.96 }}
                transition={springConfig}
              >
                View Documentation
                <ChevronRight size={16} color="currentColor" />
              </motion.a>
            </motion.div>

            {/* Stat pills */}
            <motion.div className="landing-stats-row" variants={iv}>
              <div className="landing-stat-pill">
                <Zap size={13} color="currentColor" />
                O(N) Kadane's
              </div>
              <div className="landing-stat-pill">
                <TrendingUp size={13} color="currentColor" />
                10× Faster
              </div>
              <div className="landing-stat-pill">
                <Activity size={13} color="currentColor" />
                3 Algorithms
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ── Algorithm Cards Section ───────────────────────────────────────── */}
        <section style={{ background: 'var(--surface-well)', padding: '80px 0' }}>
          <div className="landing-section" style={{ paddingTop: 0, paddingBottom: 0 }}>
            <motion.div
              className="landing-section-header"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
            >
              <h2 className="landing-section-title">Three Paradigms, One Problem</h2>
              <p className="landing-section-sub">
                Maximum subarray profit — solved three ways. Each reveals a distinct trade-off
                between complexity, runtime, and implementation cost.
              </p>
            </motion.div>

            <div className="algo-cards-grid">
              {ALGORITHMS.map((algo, i) => (
                <motion.div
                  key={algo.name}
                  className="algo-card"
                  style={{
                    borderLeft: `4px solid ${algo.color}`,
                    boxShadow: `var(--shadow-raised), 0 4px 24px ${algo.colorDim}`,
                  }}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                  whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.5, delay: i * 0.1 }}
                  whileHover={shouldReduceMotion ? {} : { y: -4, transition: { type: 'spring', bounce: 0, duration: 0.3 } }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Complexity badge */}
                  <div
                    className="complexity-badge"
                    style={{
                      background: algo.colorDim,
                      color: algo.color,
                      border: `1px solid ${algo.color}44`,
                    }}
                  >
                    {algo.complexity}
                  </div>

                  <h3 style={{
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.015em',
                    fontOpticalSizing: 'auto',
                    marginBottom: 8,
                  }}>
                    {algo.name}
                  </h3>

                  <p style={{
                    fontSize: '0.9rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                    margin: 0,
                  }}>
                    {algo.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features Grid Section ─────────────────────────────────────────── */}
        <section>
          <div className="landing-section">
            <motion.div
              className="landing-section-header"
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
            >
              <h2 className="landing-section-title">What You Can Do</h2>
              <p className="landing-section-sub">
                A full research toolkit — from raw data ingestion to publishable PDF reports.
              </p>
            </motion.div>

            <div className="features-grid">
              {FEATURES.map((feat, i) => {
                const Icon = feat.icon
                const iconBg = feat.color + '18'
                return (
                  <motion.div
                    key={feat.label}
                    className="feature-card"
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
                    whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.5, delay: i * 0.07 }}
                    whileHover={shouldReduceMotion ? {} : { y: -3, transition: { type: 'spring', bounce: 0, duration: 0.3 } }}
                  >
                    <div
                      className="feature-icon-wrap"
                      style={{ background: iconBg }}
                    >
                      <Icon size={20} color={feat.color} />
                    </div>
                    <div>
                      <div style={{
                        fontWeight: 700,
                        fontSize: '0.9375rem',
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.01em',
                        marginBottom: 5,
                      }}>
                        {feat.label}
                      </div>
                      <p style={{
                        fontSize: '0.875rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                        margin: 0,
                      }}>
                        {feat.desc}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Tech Stack Section ────────────────────────────────────────────── */}
        <div className="landing-tech-section">
          <div className="landing-tech-label">Built On</div>
          <div className="tech-pills-row">
            {TECH.map((t) => (
              <span key={t} className="tech-pill">{t}</span>
            ))}
          </div>
        </div>

        {/* ── Footer CTA ────────────────────────────────────────────────────── */}
        <section className="landing-footer-cta" aria-labelledby="footer-cta-title">
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
          >
            <h2 id="footer-cta-title" className="landing-footer-cta-title">
              Ready to analyze?
            </h2>
            <p className="landing-footer-cta-sub">
              Load a dataset, run all three algorithms, and generate a peer-review-ready report
              in under 60 seconds.
            </p>
            <motion.button
              type="button"
              className="landing-btn-primary"
              style={{ fontSize: '1rem', padding: '14px 32px', minHeight: 52 }}
              onClick={launch}
              whileTap={{ scale: 0.96 }}
              transition={springConfig}
            >
              Launch App →
            </motion.button>
          </motion.div>

          {/* Footer credits */}
          <div style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: '1px solid var(--divider)',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            <Activity size={13} color="currentColor" />
            <span>Stock Peak Analyzer · DAA Academic Project · React + FastAPI</span>
          </div>
        </section>

      </div>
    </>
  )
}
