'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import HomeStory from './components/HomeStory';
import StoryToggle from './components/StoryToggle';

const STORY_PREF_KEY = 'recrify:home-3d-story';

const useIsoLayout =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ---------------------------------- Icons --------------------------------- */

const ICON_PATHS: Record<string, ReactNode> = {
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.4 7 9.6 4-1.2 7-5.1 7-9.6V6l-7-3Z" />
      <path d="m9 11.5 2 2 4-4" />
    </>
  ),
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  report: (
    <>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6M10 17h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.2 2.6-5 5.5-5s5.5 1.8 5.5 5" />
      <path d="M16 6.6a3 3 0 0 1 0 5.8" />
      <path d="M17.6 15c2.3.5 3.9 2.1 3.9 5" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </>
  ),
  heart: (
    <path d="M12 20s-7-4.3-7-10a4.2 4.2 0 0 1 7-3 4.2 4.2 0 0 1 7 3c0 5.7-7 10-7 10Z" />
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  check: <path d="m5 12 5 5 9-11" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M8 9l4-4 4 4" />
      <path d="M5 19h14" />
    </>
  ),
  badge: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2.3" />
      <path d="M5.6 16c.6-1.6 2-2.3 3.4-2.3s2.8.7 3.4 2.3" />
      <path d="M15 9.5h4M15 13h4" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v15M6 19h12M7 8h10" />
      <path d="m7 8-3 5h6L7 8Zm10 0-3 5h6l-3-5Z" />
    </>
  ),
  arrow: <path d="M5 12h13M12 6l6 6-6 6" />,
};

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/* ----------------------------------- Data --------------------------------- */

const WHO = [
  { icon: 'building', title: 'PG Owners', desc: 'Screen residents before move-in.' },
  { icon: 'home', title: 'Landlords', desc: 'Verify tenants before renting.' },
  {
    icon: 'heart',
    title: 'Parents Hiring Caretakers',
    desc: 'Reduce uncertainty before trusting someone with loved ones.',
  },
  {
    icon: 'briefcase',
    title: 'Shops & Businesses',
    desc: 'Verify staff before onboarding.',
  },
  {
    icon: 'users',
    title: 'Domestic Worker Hiring',
    desc: 'Screen maids, cooks, drivers, and helpers.',
  },
  {
    icon: 'layers',
    title: 'Agencies & Property Managers',
    desc: 'Manage onboarding at scale.',
  },
];

const STEPS = [
  {
    n: '01',
    icon: 'upload',
    title: 'Upload details or PAN',
    desc: "Enter the person's basic details or PAN number to start a consent-first verification.",
  },
  {
    n: '02',
    icon: 'search',
    title: 'Screening runs',
    desc: 'Identity and background screening runs across available verification sources.',
  },
  {
    n: '03',
    icon: 'report',
    title: 'Receive a trust report',
    desc: 'Get a clear, professional report with risk indicators and match confidence.',
  },
];

const VERIFIED = [
  {
    icon: 'badge',
    title: 'Identity Verification',
    points: [
      'PAN validation',
      'Name consistency',
      'DOB verification',
      'Address consistency',
    ],
  },
  {
    icon: 'search',
    title: 'Background Screening',
    points: [
      'Available adverse record indicators',
      'Public & legal risk signals',
      'Identity-linked screening',
    ],
  },
  {
    icon: 'scale',
    title: 'Verification Confidence',
    points: ['Risk indicators', 'Match confidence', 'Structured reporting'],
  },
];

const WHY = [
  { icon: 'bolt', title: 'Fast', desc: 'Reports in minutes.' },
  { icon: 'report', title: 'Professional', desc: 'Structured trust reports.' },
  { icon: 'shield', title: 'Built for India', desc: 'Designed for real onboarding needs.' },
  { icon: 'lock', title: 'Privacy First', desc: 'Consent-based verification.' },
  { icon: 'layers', title: 'Scalable', desc: 'For individuals and businesses.' },
  { icon: 'check', title: 'Simple', desc: 'No paperwork chaos.' },
];

const INDUSTRIES = [
  'Tenant verification',
  'PG onboarding',
  'Domestic worker hiring',
  'Caretaker verification',
  'Driver screening',
  'Employee onboarding',
  'Contract staff',
  'Freelancer screening',
  'Service workers',
  'Property onboarding',
];

const SECURITY = [
  {
    icon: 'check',
    title: 'Consent-first verification',
    desc: 'Every check is run with the individual’s consent — no covert screening.',
  },
  {
    icon: 'lock',
    title: 'Encrypted data handling',
    desc: 'Personal data is encrypted in transit and handled on a need-to-know basis.',
  },
  {
    icon: 'report',
    title: 'Professional reporting',
    desc: 'Structured, legally careful reports — signals and indicators, never verdicts.',
  },
  {
    icon: 'shield',
    title: 'Privacy-focused infrastructure',
    desc: 'Verification data stays minimal, scoped, and access-controlled.',
  },
];

const TESTIMONIALS = [
  {
    quote:
      'We screen every resident before move-in now. It takes minutes and gives our PG a far more professional onboarding process.',
    name: 'Anjali Mehta',
    role: 'PG Owner, Pune',
  },
  {
    quote:
      'Hiring counter staff used to be a gut call. Recrify gives me a clear report so I can make a more informed decision.',
    name: 'Rohit Sharma',
    role: 'Shop Owner, Jaipur',
  },
  {
    quote:
      'Before trusting someone with my parents’ care, I wanted real verification. The report was clear and easy to understand.',
    name: 'Kavya Nair',
    role: 'Hiring a caretaker, Bengaluru',
  },
];

const FAQS = [
  {
    q: 'How does verification work?',
    a: 'You enter a person’s details or PAN with their consent. Recrify runs identity and background screening across available sources and returns a structured trust report with risk indicators and match confidence.',
  },
  {
    q: 'What data is verified?',
    a: 'Identity signals such as PAN validity, name consistency, date of birth and address consistency, along with available adverse record and public risk indicators linked to the identity.',
  },
  {
    q: 'Is consent required?',
    a: 'Yes. Recrify is consent-first. Verification is intended to be run with the knowledge and consent of the person being screened.',
  },
  {
    q: 'How fast are reports?',
    a: 'Most reports are generated within minutes, depending on the checks selected and source availability.',
  },
  {
    q: 'Can landlords use Recrify?',
    a: 'Yes. Landlords and PG owners use Recrify to verify tenants and residents before move-in as part of a safer onboarding process.',
  },
  {
    q: 'Can businesses onboard employees?',
    a: 'Yes. Shops, SMEs and agencies use Recrify to screen staff and contract workers, with bulk verification available on business plans.',
  },
  {
    q: 'Does verification guarantee safety?',
    a: 'No. Recrify surfaces available verification signals and risk indicators to support better-informed decisions. It does not guarantee outcomes or certify that a person is safe.',
  },
  {
    q: 'How secure is personal data?',
    a: 'Data is encrypted in transit, access is scoped, and verification information is kept minimal — built around a privacy-focused approach to handling personal data.',
  },
];

/* --------------------------------- Page ----------------------------------- */

export default function RecrifyLanding() {
  const root = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  /* ---- 3D story preference ----------------------------------------------
     Starts on so the server and first client render agree. A saved choice, or
     a reduced-motion preference, is applied right after mount — the story sits
     below the fold, so there is no visible flash. */
  const [story3d, setStory3d] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORY_PREF_KEY);
    if (saved !== null) {
      setStory3d(saved === '1');
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStory3d(false);
    }
  }, []);

  const toggleStory3d = useCallback((next: boolean) => {
    setStory3d(next);
    try {
      window.localStorage.setItem(STORY_PREF_KEY, next ? '1' : '0');
    } catch {
      /* private browsing — the choice just won't persist */
    }
  }, []);

  /* Adding or removing the story changes the height of everything below it,
     so every ScrollTrigger downstream needs its start/end recomputed. */
  useEffect(() => {
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 60);
    return () => window.clearTimeout(id);
  }, [story3d]);
  useIsoLayout(() => {
    const el = root.current;
    if (!el) return;

    gsap.registerPlugin(ScrollTrigger);

    /* ---- Lenis smooth scroll (drives ScrollTrigger) ---- */
    let lenis: Lenis | null = null;
    let lenisRaf: ((time: number) => void) | null = null;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lenis = new Lenis({ autoRaf: false, lerp: 0.11 });
      lenis.on('scroll', ScrollTrigger.update);
      lenisRaf = (time: number) => lenis!.raf(time * 1000);
      gsap.ticker.add(lenisRaf);
      gsap.ticker.lagSmoothing(0);
    }

    const ctx = gsap.context(() => {
      /* ---- Hero intro timeline (the opening of the story) ---- */
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.ep-eyebrow', { y: 16, autoAlpha: 0, duration: 0.5 })
        .from(
          '.ep-line-in',
          { yPercent: 118, duration: 0.9, stagger: 0.12 },
          '-=0.2',
        )
        .from(
          '.ep-hero-sub',
          { y: 18, autoAlpha: 0, duration: 0.6 },
          '-=0.45',
        )
        .from(
          '.ep-hero-bullets li',
          { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.08 },
          '-=0.35',
        )
        .from(
          '.ep-hero-actions > *',
          { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.1 },
          '-=0.3',
        )
        .from('.ep-hero-trustline', { autoAlpha: 0, duration: 0.5 }, '-=0.3')
        .from(
          '.ep-hero-illustration',
          { y: 64, autoAlpha: 0, duration: 0.95 },
          '-=1.15',
        );

      /* ---- Scroll-revealed sections (the story unfolds) ---- */
      el.querySelectorAll<HTMLElement>('.ep-reveal').forEach((node) => {
        gsap.from(node, {
          y: 44,
          autoAlpha: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: node, start: 'top 86%' },
        });
      });
      el.querySelectorAll<HTMLElement>('.ep-reveal-group').forEach((group) => {
        gsap.from(Array.from(group.children), {
          y: 40,
          autoAlpha: 0,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.09,
          scrollTrigger: { trigger: group, start: 'top 82%' },
        });
      });

      /* ---- "How it works" connecting line draws as you scroll ---- */
      gsap.to('.ep-how-line-fill', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '.ep-steps',
          start: 'top 72%',
          end: 'bottom 80%',
          scrub: 0.6,
        },
      });

      /* ---- Soft parallax on the hero panel ---- */
      gsap.to('.ep-hero-visual', {
        y: -54,
        ease: 'none',
        scrollTrigger: {
          trigger: '.ep-hero',
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });

      /* ---- Top scroll-progress bar ---- */
      gsap.to('.ep-progress', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          start: 0,
          end: () => ScrollTrigger.maxScroll(window),
          scrub: 0.25,
        },
      });

      /* ---- Navbar elevates once you scroll past the hero top ---- */
      ScrollTrigger.create({
        start: 'top -12',
        toggleClass: { targets: '.ep-nav', className: 'is-scrolled' },
      });

      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.ready.then(() => ScrollTrigger.refresh());
      }
    }, root);

    return () => {
      ctx.revert();
      if (lenisRaf) gsap.ticker.remove(lenisRaf);
      lenis?.destroy();
    };
  }, []);

  return (
    <div className="ep" ref={root}>
      <div className="ep-progress" aria-hidden="true" />

      {/* ============================ NAVBAR ============================ */}
      <header className="ep-nav">
        <div className="ep-container ep-nav-inner">
          <Link href="/" className="ep-logo">
            <Image
              className="ep-logo-mark"
              src="/logo-mark.png"
              alt=""
              width={34}
              height={34}
              priority
              aria-hidden="true"
            />
            <span className="ep-logo-text">Recrify</span>
          </Link>
          <nav className="ep-nav-links">
            <a href="#how">How it Works</a>
            <a href="#who">Who It&apos;s For</a>
            <a href="#pricing">Pricing</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQs</a>
          </nav>
          <div className="ep-nav-cta">
            <a
              className="ep-btn ep-btn-ghost"
              href="mailto:hello@recrify.in?subject=Book%20a%20Demo"
            >
              Book Demo
            </a>
            <Link className="ep-btn ep-btn-primary" href="/login">
              Verify Now
            </Link>
          </div>
        </div>
      </header>

      {/* ============================= HERO ============================= */}
      <section className="ep-hero">
        <div className="ep-glow" aria-hidden="true" />
        <div className="ep-container ep-hero-grid">
          <div className="ep-hero-copy">
            <span className="ep-eyebrow">
              <Icon name="shield" className="ep-eyebrow-icon" />
              Trust &amp; verification platform
            </span>
            <h1 className="ep-hero-title">
              <span className="ep-line">
                <span className="ep-line-in">Verify Before You</span>
              </span>
              <span className="ep-line">
                <span className="ep-line-in">Hire or Rent</span>
              </span>
            </h1>
            <p className="ep-hero-sub">
              Background screening for tenants, employees, caretakers, domestic
              workers, PG residents, drivers, and service professionals.
            </p>
            <ul className="ep-hero-bullets">
              {[
                'Fast reports',
                'Consent-first verification',
                'Built for landlords, PGs & businesses',
                'Secure and privacy focused',
              ].map((b) => (
                <li key={b}>
                  <Icon name="check" className="ep-bullet-icon" />
                  {b}
                </li>
              ))}
            </ul>
            <div className="ep-hero-actions">
              <Link className="ep-btn ep-btn-primary ep-btn-lg" href="/login">
                Verify Now
                <Icon name="arrow" className="ep-arrow" />
              </Link>
              <a
                className="ep-btn ep-btn-ghost ep-btn-lg"
                href="mailto:hello@recrify.in?subject=Book%20a%20Demo"
              >
                Book Demo
              </a>
            </div>
            <p className="ep-hero-trustline">
              Trusted onboarding for PGs, landlords, shops, and growing
              businesses.
            </p>
          </div>

          <div className="ep-hero-visual">
            <div className="ep-hero-illustration">
              <img
                src="/landing/heroimage.png"
                alt="Verified domestic workers, drivers and service professionals — cook, driver, nanny, maid, security guard and office professional, each marked Verified / No Risk"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ========================= THE KNOCK (story) ==================== */}
      {story3d && <HomeStory />}

      {/* =========================== TRUST BAR ========================== */}
      <section className="ep-trustbar">
        <div className="ep-container">
          <p className="ep-trustbar-label">Used by</p>
          <div className="ep-trustbar-row ep-reveal-group">
            {['PG Owners', 'Landlords', 'Shops', 'SMEs', 'Agencies', 'Property Managers'].map(
              (t) => (
                <span key={t} className="ep-trustbar-item">
                  {t}
                </span>
              ),
            )}
          </div>
          <p className="ep-trustbar-micro">
            Designed for safer onboarding and smarter hiring.
          </p>
        </div>
      </section>

      {/* =========================== WHO IT'S FOR ======================= */}
      <section className="ep-section" id="who">
        <div className="ep-container">
          <SectionHead
            kicker="Who it's for"
            title="Built for Every Hiring & Onboarding Decision"
          />
          <div className="ep-grid-3 ep-reveal-group">
            {WHO.map((c, i) => (
              <article key={c.title} className="ep-card ep-card-hover">
                <div className="ep-card-row">
                  <span className="ep-card-icon">
                    <Icon name={c.icon} />
                  </span>
                  <span className="ep-card-index">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="ep-card-title">{c.title}</h3>
                <p className="ep-card-text">{c.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== HOW IT WORKS ======================= */}
      <section className="ep-section ep-section-alt" id="how">
        <div className="ep-container">
          <SectionHead
            kicker="How it works"
            title="Verification in Three Simple Steps"
          />
          <div className="ep-steps">
            <div className="ep-how-line" aria-hidden="true">
              <div className="ep-how-line-fill" />
            </div>
            {STEPS.map((s) => (
              <div key={s.n} className="ep-step ep-reveal">
                <div className="ep-step-num">{s.n}</div>
                <span className="ep-step-icon">
                  <Icon name={s.icon} />
                </span>
                <h3 className="ep-card-title">{s.title}</h3>
                <p className="ep-card-text">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================= WHAT GETS VERIFIED =================== */}
      <section className="ep-section">
        <div className="ep-container">
          <SectionHead
            kicker="What gets verified"
            title="Clear Signals, Structured Reporting"
          />
          <div className="ep-grid-3 ep-reveal-group">
            {VERIFIED.map((v) => (
              <article key={v.title} className="ep-card">
                <span className="ep-card-icon">
                  <Icon name={v.icon} />
                </span>
                <h3 className="ep-card-title" style={{ marginTop: 16 }}>
                  {v.title}
                </h3>
                <ul className="ep-check-list">
                  {v.points.map((p) => (
                    <li key={p}>
                      <Icon name="check" className="ep-bullet-icon" />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ========================= SAMPLE REPORT ======================== */}
      <section className="ep-section ep-section-alt">
        <div className="ep-container ep-split">
          <div className="ep-reveal">
            <SectionHead
              kicker="Sample report"
              title="A Report You Can Act On"
              align="left"
            />
            <p className="ep-section-text">
              Every Recrify report distils verification into a clear summary —
              risk score, identity match, confidence, and a structured
              recommendation. No jargon, no guesswork.
            </p>
            <div className="ep-status-legend">
              <span className="ep-status ep-status-clear">Clear</span>
              <span className="ep-status ep-status-review">
                Review Recommended
              </span>
              <span className="ep-status ep-status-attention">
                Attention Needed
              </span>
            </div>
            <Link className="ep-btn ep-btn-primary ep-btn-lg" href="/signup">
              View Sample Report
            </Link>
          </div>

          <div className="ep-report ep-reveal">
            <div className="ep-report-head">
              <div>
                <div className="ep-report-title">Trust Report</div>
                <div className="ep-report-id">REPORT #EP-20451</div>
              </div>
              <span className="ep-status ep-status-review">
                Review Recommended
              </span>
            </div>
            <div className="ep-report-metrics">
              <Metric label="Risk Score" value="42" tone="review" />
              <Metric label="Verification Confidence" value="88%" tone="clear" />
              <Metric label="Identity Match" value="96%" tone="clear" />
            </div>
            <div className="ep-report-block">
              <div className="ep-report-block-label">Flags &amp; Alerts</div>
              <div className="ep-report-flag">
                <Icon name="shield" />1 public record indicator linked to
                identity
              </div>
            </div>
            <div className="ep-report-block">
              <div className="ep-report-block-label">Recommendation</div>
              <p className="ep-report-rec">
                Identity is well matched. One verification signal warrants a
                closer look before onboarding.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================== WHY EPALIFY ======================== */}
      <section className="ep-section">
        <div className="ep-container">
          <SectionHead
            kicker="Why Recrify"
            title="Why Businesses & Families Choose Recrify"
          />
          <div className="ep-grid-3 ep-reveal-group">
            {WHY.map((c) => (
              <article key={c.title} className="ep-card ep-card-hover">
                <span className="ep-card-icon">
                  <Icon name={c.icon} />
                </span>
                <h3 className="ep-card-title" style={{ marginTop: 16 }}>
                  {c.title}
                </h3>
                <p className="ep-card-text">{c.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== INDUSTRIES ========================= */}
      <section className="ep-section ep-section-alt">
        <div className="ep-container">
          <SectionHead
            kicker="Use cases"
            title="One Platform, Many Onboarding Needs"
          />
          <div className="ep-industries ep-reveal-group">
            {INDUSTRIES.map((label) => (
              <span key={label} className="ep-industry">
                <Icon name="check" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============================ PRICING =========================== */}
      <section className="ep-section" id="pricing">
        <div className="ep-container">
          <SectionHead kicker="Pricing" title="Simple, Transparent Pricing" />
          <div className="ep-pricing ep-reveal-group">
            <article className="ep-price-card ep-price-popular">
              <span className="ep-price-badge">Most Popular</span>
              <h3 className="ep-price-name">Individual Verification</h3>
              <div className="ep-price-amount">
                ₹499 <span className="ep-price-unit">/ report</span>
              </div>
              <p className="ep-price-desc">
                For one-off checks before hiring or renting.
              </p>
              <ul className="ep-check-list">
                {[
                  'Identity screening',
                  'Risk indicators',
                  'Professional report',
                  'Fast turnaround',
                ].map((f) => (
                  <li key={f}>
                    <Icon name="check" className="ep-bullet-icon" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link className="ep-btn ep-btn-primary ep-btn-block" href="/login">
                Verify Now
              </Link>
            </article>

            <article className="ep-price-card">
              <h3 className="ep-price-name">Business Plans</h3>
              <div className="ep-price-amount">
                Volume <span className="ep-price-unit">pricing</span>
              </div>
              <p className="ep-price-desc">
                For PGs, agencies and businesses verifying at scale.
              </p>
              <ul className="ep-check-list">
                {[
                  'Bulk verification',
                  'Team access & history',
                  'Downloadable reports',
                  'Monthly billing',
                ].map((f) => (
                  <li key={f}>
                    <Icon name="check" className="ep-bullet-icon" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                className="ep-btn ep-btn-ghost ep-btn-block"
                href="mailto:sales@recrify.in?subject=Business%20Plan%20Enquiry"
              >
                Talk to Sales
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* ======================= PRODUCT SCREENSHOTS ==================== */}
      <section className="ep-section ep-section-alt" id="product">
        <div className="ep-container">
          <SectionHead
            kicker="The product"
            title="Two Sides, One Smooth Verification"
          />
          <p className="ep-section-text ep-section-text-center">
            A clean dashboard for whoever is hiring or renting. A guided,
            consent-first flow for the person being verified.
          </p>

          <div className="ep-shots ep-reveal-group">
            <figure className="ep-shot">
              <div className="ep-shot-frame">
                <div className="ep-shot-chrome" aria-hidden="true">
                  <span /><span /><span />
                </div>
                <img
                  src="/landing/client-dashboard.png"
                  alt="Recrify client dashboard listing candidates"
                  loading="lazy"
                />
              </div>
              <figcaption>
                <span className="ep-shot-tag">For the client</span>
                <h3 className="ep-shot-title">Your candidates, at a glance</h3>
                <p className="ep-shot-text">
                  Every person you&apos;ve invited, their role, their status,
                  and where each check stands — all on one page.
                </p>
              </figcaption>
            </figure>

            <figure className="ep-shot">
              <div className="ep-shot-frame">
                <div className="ep-shot-chrome" aria-hidden="true">
                  <span /><span /><span />
                </div>
                <img
                  src="/landing/candidate-page.png"
                  alt="Recrify candidate identity-verification flow"
                  loading="lazy"
                />
              </div>
              <figcaption>
                <span className="ep-shot-tag">For the candidate</span>
                <h3 className="ep-shot-title">Verify in a few quiet steps</h3>
                <p className="ep-shot-text">
                  Candidates upload their PAN and verify Aadhaar via
                  DigiLocker — secure, consent-based, no paperwork.
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ========================== TESTIMONIALS ======================== */}
      <section className="ep-section">
        <div className="ep-container">
          <SectionHead
            kicker="Testimonials"
            title="Trusted by People Who Onboard Carefully"
          />
          <div className="ep-testimonials ep-reveal-group">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="ep-quote">
                <span className="ep-quote-mark">&ldquo;</span>
                <blockquote className="ep-quote-text">{t.quote}</blockquote>
                <figcaption className="ep-quote-by">
                  <span className="ep-quote-avatar">{t.name.charAt(0)}</span>
                  <span>
                    <span className="ep-quote-name">{t.name}</span>
                    <span className="ep-quote-role">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== FAQ ============================= */}
      <section className="ep-section ep-section-alt" id="faq">
        <div className="ep-container ep-faq-wrap">
          <SectionHead kicker="FAQs" title="Questions, Answered" />
          <div className="ep-faq ep-reveal-group">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={f.q}
                  className={`ep-faq-item ${open ? 'is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="ep-faq-q"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                  >
                    <span>{f.q}</span>
                    <Icon name="chevron" className="ep-faq-chevron" />
                  </button>
                  {open && <p className="ep-faq-a">{f.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================= SECURITY (dark) ====================== */}
      <section className="ep-section ep-section-dark" id="security">
        <div className="ep-container">
          <SectionHead
            kicker="Security & privacy"
            title="Built Around Trust, Privacy & Security"
          />
          <div className="ep-grid-4 ep-reveal-group">
            {SECURITY.map((c) => (
              <article key={c.title} className="ep-card ep-card-hover">
                <span className="ep-card-icon">
                  <Icon name={c.icon} />
                </span>
                <h3 className="ep-card-title" style={{ marginTop: 16 }}>
                  {c.title}
                </h3>
                <p className="ep-card-text">{c.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* =========================== FINAL CTA ========================== */}
      <section className="ep-finalcta">
        <div className="ep-container ep-reveal">
          <h2 className="ep-finalcta-title">
            Hire, Rent, and Onboard with More Confidence
          </h2>
          <p className="ep-finalcta-sub">
            Professional verification for tenants, workers, caretakers, and
            employees.
          </p>
          <div className="ep-finalcta-actions">
            <Link className="ep-btn ep-btn-light ep-btn-lg" href="/login">
              Verify Now
              <Icon name="arrow" className="ep-arrow" />
            </Link>
            <a
              className="ep-btn ep-btn-outline-light ep-btn-lg"
              href="mailto:hello@recrify.in?subject=Book%20a%20Demo"
            >
              Book Demo
            </a>
          </div>
        </div>
      </section>

      {/* ============================ FOOTER ============================ */}
      <footer className="ep-footer">
        <div className="ep-container ep-footer-grid">
          <div className="ep-footer-brand">
            <Link href="/" className="ep-logo">
              <Image
                className="ep-logo-mark"
                src="/logo-mark.png"
                alt=""
                width={34}
                height={34}
                aria-hidden="true"
              />
              <span className="ep-logo-text">Recrify</span>
            </Link>
            <p className="ep-footer-tag">
              Trust and verification for safer hiring, renting and onboarding.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={['How it Works', "What's Verified", 'Sample Report', 'Pricing']}
          />
          <FooterCol
            title="Use Cases"
            links={[
              'Tenant Verification',
              'PG Onboarding',
              'Domestic Workers',
              'Employee Screening',
            ]}
          />
          <FooterCol
            title="Company"
            links={['About', 'Security', 'Contact', 'Book Demo']}
          />
          <FooterCol
            title="Legal"
            links={['Privacy Policy', 'Terms', 'Refund Policy', 'Support']}
          />
        </div>
        <div className="ep-container ep-footer-base">
          <span>© {new Date().getFullYear()} Recrify</span>
          <span>Consent-first verification · Privacy focused</span>
        </div>
      </footer>

      <StoryToggle on={story3d} onToggle={toggleStory3d} />
    </div>
  );
}

/* ------------------------------ Sub-components ----------------------------- */

function SectionHead({
  kicker,
  title,
  align = 'center',
}: {
  kicker: string;
  title: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={`ep-head ep-head-${align} ep-reveal`}>
      <span className="ep-kicker">{kicker}</span>
      <h2 className="ep-head-title">{title}</h2>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'clear' | 'review' | 'attention';
}) {
  return (
    <div className="ep-metric">
      <div className={`ep-metric-value ep-metric-${tone}`}>{value}</div>
      <div className="ep-metric-label">{label}</div>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="ep-footer-col">
      <div className="ep-footer-col-title">{title}</div>
      <ul>
        {links.map((l) => (
          <li key={l}>
            <a href="#">{l}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
