'use client';

/* ============================================================================
   HomeStory — "The Knock"
   A pinned, scroll-scrubbed 3D story: an applicant arrives with perfect
   paperwork; an Recrify check reveals the documents belong to someone else;
   the next applicant verifies clean and the door opens.
   Three.js (R3F) scene + DOM overlays + one GSAP timeline. Light theme.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createRig, type StoryRig } from './storyRig';

const StoryScene3D = dynamic(() => import('./StoryScene3D'), { ssr: false });

const useIsoLayout =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;


/* ------------------------------- Copy beats ------------------------------- */

const CAPTIONS = [
  { k: '01 — the knock', t: 'Every hire starts with a stranger at the door.' },
  { k: '02 — the applicant', t: 'He says he’s from maintenance. Uniform, toolbox, a folder of references.' },
  { k: '03 — the paperwork', t: 'ID, references, nine years of experience. Everything looks right.' },
  { k: '04 — the check', t: 'Thirty seconds in Recrify — before he’s inside your house.' },
  { k: '05 — the flag', t: "Three checks pass. One doesn't." },
  { k: '06 — the reveal', t: 'The papers belong to someone else. The uniform is a costume — and the man behind it has a record.' },
  { k: '07 — the right way', t: 'The next applicant is exactly who she says she is. Verified in 28 seconds.' },
];

/* --------------------------- Camera keyframes ------------------------------ */

type Cam = { x: number; y: number; z: number; tx: number; ty: number; tz?: number };

const CAMS: Record<'desktop' | 'mobile', Record<string, Cam>> = {
  desktop: {
    // opens wide on the whole property, then pushes in to the doorstep
    intro: { x: -8.6, y: 4.6, z: 15.2, tx: 0.4, ty: 1.5 },
    start: { x: -6.4, y: 3.6, z: 11.6, tx: 0.4, ty: 1.4 },
    arrive: { x: -4.2, y: 2.7, z: 8.2, tx: 0.1, ty: 1.25 },
    papers: { x: -2.6, y: 2.1, z: 5.9, tx: 0.05, ty: 1.35 },
    flag: { x: -2.2, y: 1.95, z: 5.3, tx: 0.05, ty: 1.35 },
    reveal: { x: -1.6, y: 1.75, z: 4.6, tx: 0, ty: 1.4 },
    turn: { x: -3.4, y: 2.3, z: 6.9, tx: 0.25, ty: 1.2 },
    cta: { x: -6.0, y: 3.4, z: 10.8, tx: 0.4, ty: 1.4 },
  },
  mobile: {
    intro: { x: -5.2, y: 4.0, z: 17.5, tx: 0.2, ty: 1.5 },
    start: { x: -4.2, y: 3.3, z: 14.5, tx: 0.2, ty: 1.45 },
    arrive: { x: -3.0, y: 2.6, z: 10.8, tx: 0.05, ty: 1.3 },
    papers: { x: -2.0, y: 2.2, z: 8.4, tx: 0, ty: 1.4 },
    flag: { x: -1.8, y: 2.05, z: 7.7, tx: 0, ty: 1.4 },
    reveal: { x: -1.3, y: 1.9, z: 6.9, tx: 0, ty: 1.45 },
    turn: { x: -2.5, y: 2.5, z: 9.5, tx: 0.15, ty: 1.3 },
    cta: { x: -4.0, y: 3.2, z: 13.5, tx: 0.2, ty: 1.45 },
  },
};

/* ------------------------------ Tiny helpers ------------------------------ */

function Tick({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.25" fill="none" strokeWidth="1.5" />
      <path d="M4.8 8.3l2.1 2.2 4.3-4.8" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.25" fill="none" strokeWidth="1.5" />
      <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" fill="none" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`ep-story-spin ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="26 15" />
    </svg>
  );
}

/* An abstract "photo" for documents — geometric, deliberately not a real face. */
function AvatarGlyph({ variant, className = '' }: { variant: 'a' | 'b' | 'c'; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="6" className="ep-avg-bg" />
      {variant === 'a' && (
        <g className="ep-avg-fg">
          {/* short side-part hair — the man the papers describe */}
          <path d="M24 10c-5.8 0-9.4 3.4-9.4 8.4l2.2-.6 1-2.8 8.4-1.6 6 2.2.8 2.8 1.4.6c0-5-3.6-9-10.4-9z" />
          <circle cx="24" cy="21" r="6.3" className="ep-avg-face" />
          <path d="M10 44c1.8-7 7.6-10 14-10s12.2 3 14 10z" />
        </g>
      )}
      {variant === 'b' && (
        <g className="ep-avg-fg">
          <path d="M24 10c-5.4 0-8.8 3.2-8.8 8h17.6c0-4.8-3.4-8-8.8-8z" />
          <circle cx="24" cy="21" r="6.2" className="ep-avg-face" />
          <path
            d="M17.5 20.5h4.4m4.2 0h4.4m-8.6 0a2.2 2.2 0 1 0 0 .1zm8.6 0a2.2 2.2 0 1 0 0 .1z"
            fill="none"
            strokeWidth="1.4"
            className="ep-avg-line"
          />
          <path d="M11 44c1.7-6.6 7.2-9.4 13-9.4S35.3 37.4 37 44z" />
        </g>
      )}
      {variant === 'c' && (
        <g className="ep-avg-fg">
          <path d="M24 9.5c-5.8 0-9.4 4-9.4 9.2 0 1.6.3 3 .8 4.3h17.2c.5-1.3.8-2.7.8-4.3 0-5.2-3.6-9.2-9.4-9.2z" />
          <circle cx="24" cy="20.5" r="6.2" className="ep-avg-face" />
          <circle cx="24" cy="11" r="3" />
          <path d="M10.5 44c1.8-6.8 7.4-9.7 13.5-9.7s11.7 2.9 13.5 9.7z" />
        </g>
      )}
    </svg>
  );
}

function CheckRow({ id, label, state, note }: { id: string; label: string; state: 'pass' | 'fail'; note?: string }) {
  return (
    <div className={`ep-story-row ep-story-row-${state}`} data-row={id}>
      <span className="ep-story-row-status">
        <Spinner className="ep-story-row-spinner" />
        {state === 'pass' ? (
          <Tick className="ep-story-row-mark ep-story-row-tick" />
        ) : (
          <Cross className="ep-story-row-mark ep-story-row-cross" />
        )}
      </span>
      <span className="ep-story-row-label">{label}</span>
      <span className="ep-story-row-note">{note}</span>
    </div>
  );
}

/* ================================ Component =============================== */

export default function HomeStory() {
  const root = useRef<HTMLElement>(null);
  const rigRef = useRef<StoryRig>(createRig(false));
  const [scene, setScene] = useState<null | 'motion'>(null);

  useIsoLayout(() => {
    const el = root.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();

    mm.add(
      {
        motion: '(prefers-reduced-motion: no-preference)',
        mobile: '(max-width: 820px)',
      },
      (ctx) => {
        const { motion, mobile } = ctx.conditions as { motion: boolean; mobile: boolean };

        if (!motion) {
          el.classList.add('is-static');
          setScene(null);
          return () => el.classList.remove('is-static');
        }

        setScene('motion');
        const rig = rigRef.current;
        Object.assign(rig, createRig(mobile)); // reset baseline for this breakpoint
        const K = CAMS[mobile ? 'mobile' : 'desktop'];

        const q = gsap.utils.selector(el);
        const caps = q('.ep-story-cap');

        /* Base states ------------------------------------------------------ */
        gsap.set(q('.ep-story-doc'), {
          autoAlpha: 0, y: 90, rotate: (i: number) => (i === 0 ? -7 : 6), scale: 0.82,
        });
        gsap.set(q('.ep-story-panel'), { autoAlpha: 0, y: 110, scale: 0.96 });
        gsap.set(q('.ep-story-row'), { autoAlpha: 0, x: 14 });
        gsap.set(q('.ep-story-row-mark'), { autoAlpha: 0, scale: 0.4 });
        gsap.set(q('.ep-story-alert'), { autoAlpha: 0, y: 8 });
        gsap.set(q('.ep-story-split'), { autoAlpha: 0 });
        gsap.set(q('.ep-story-split-label'), { autoAlpha: 0, y: 10 });
        gsap.set(q('.ep-story-verified'), { autoAlpha: 0, scale: 0.8 });
        gsap.set(q('.ep-story-cta'), { autoAlpha: 0, y: 40 });
        gsap.set(caps, { autoAlpha: 0, y: 24 });

        const showCap = (tl: gsap.core.Timeline, i: number, at: string | number) => {
          tl.to(caps[i], { autoAlpha: 1, y: 0, duration: 0.5 }, at);
          if (i > 0) tl.to(caps[i - 1], { autoAlpha: 0, y: -18, duration: 0.35 }, '<-0.1');
        };
        const camTo = (tl: gsap.core.Timeline, c: Cam, at: string | number, duration = 1.5) => {
          tl.to(rig.cam, { ...c, duration, ease: 'power1.inOut' }, at);
        };

        /* Master timeline --------------------------------------------------- */
        const tl = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: {
            trigger: el,
            start: 'top top',
            end: '+=560%',
            scrub: 1,
            pin: q('.ep-story-stage')[0],
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        /* 01 — morning, closed door */
        tl.addLabel('knock');
        tl.fromTo(rig.cam, { ...K.intro }, { ...K.start, duration: 1.4, ease: 'power1.out' }, 0);
        showCap(tl, 0, 0.15);
        tl.to(rig, { lamp: 0.55, duration: 0.8 }, 0.5);

        /* 02 — the applicant arrives, knocks */
        tl.addLabel('arrive', 1.6);
        showCap(tl, 1, 'arrive');
        camTo(tl, K.arrive, 'arrive-=0.2', 1.5);
        tl.to(rig, { v1o: 1, duration: 0.25 }, 'arrive-=0.1');
        tl.to(rig, { v1x: -1.25, duration: 1.6, ease: 'power1.inOut' }, 'arrive-=0.1');
        tl.fromTo(rig, { knock: 0 }, { knock: 1, duration: 0.6, ease: 'none', immediateRender: false }, 'arrive+=1.6');
        tl.fromTo(rig, { knock: 0 }, { knock: 1, duration: 0.6, ease: 'none', immediateRender: false }, 'arrive+=2.0');

        /* 03 — the paperwork floats up */
        tl.addLabel('papers', 3.7);
        showCap(tl, 2, 'papers');
        camTo(tl, K.papers, 'papers-=0.2', 1.6);
        tl.to(q('.ep-story-doc-id'), { autoAlpha: 1, y: 0, rotate: -4, scale: 1, duration: 0.9, ease: 'power3.out' }, 'papers+=0.25');
        tl.to(q('.ep-story-doc-ref'), { autoAlpha: 1, y: 0, rotate: 3.5, scale: 1, duration: 0.9, ease: 'power3.out' }, 'papers+=0.55');

        /* 04 — the check: docs dock into the panel, rows tick */
        tl.addLabel('check', 5.9);
        showCap(tl, 3, 'check');
        tl.to(q('.ep-story-doc'), {
          y: -40, scale: 0.62, autoAlpha: 0, rotate: 0, duration: 0.8, ease: 'power2.in', stagger: 0.08,
        }, 'check');
        tl.to(q('.ep-story-panel-run'), { autoAlpha: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }, 'check+=0.55');

        const rows = ['aadhaar', 'address', 'refs', 'pan'];
        rows.forEach((r, i) => {
          const row = `[data-row="${r}"]`;
          const at = `check+=${1.35 + i * 0.85}`;
          tl.to(row, { autoAlpha: 1, x: 0, duration: 0.4 }, at);
          if (r !== 'pan') {
            tl.to(`${row} .ep-story-row-spinner`, { autoAlpha: 0, duration: 0.2 }, `${at}+=0.55`);
            tl.to(`${row} .ep-story-row-mark`, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, `${at}+=0.55`);
          }
        });

        /* 05 — the flag: PAN row fails, the light cools */
        tl.addLabel('flag', 10.1);
        showCap(tl, 4, 'flag');
        camTo(tl, K.flag, 'flag', 1.2);
        tl.to('[data-row="pan"] .ep-story-row-spinner', { autoAlpha: 0, duration: 0.2 }, 'flag+=0.4');
        tl.to('[data-row="pan"] .ep-story-row-mark', { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' }, 'flag+=0.4');
        tl.to(q('.ep-story-panel-run'), { '--ep-story-panel-glow': 1, duration: 0.5 } as gsap.TweenVars, 'flag+=0.45');
        tl.to(q('.ep-story-alert'), { autoAlpha: 1, y: 0, duration: 0.5 }, 'flag+=0.7');
        tl.to(rig, { cold: 1, lamp: 0.2, duration: 1 }, 'flag+=0.4');

        /* 06 — the reveal: the card tears in two */
        tl.addLabel('reveal', 12.4);
        showCap(tl, 5, 'reveal');
        camTo(tl, K.reveal, 'reveal', 1.4);
        tl.to(q('.ep-story-panel-run'), { autoAlpha: 0, y: -60, scale: 0.94, duration: 0.7 }, 'reveal');
        tl.to(q('.ep-story-split'), { autoAlpha: 1, duration: 0.4 }, 'reveal+=0.5');
        tl.fromTo(q('.ep-story-split-half-l'), { x: 0, rotate: 0 }, { x: mobile ? '-8vw' : -96, rotate: -3, duration: 1.1, ease: 'power2.out', immediateRender: false }, 'reveal+=0.7');
        tl.fromTo(q('.ep-story-split-half-r'), { x: 0, rotate: 0 }, { x: mobile ? '8vw' : 96, rotate: 3, duration: 1.1, ease: 'power2.out', immediateRender: false }, 'reveal+=0.7');
        tl.fromTo(q('.ep-story-split-seam'), { scaleY: 0 }, { scaleY: 1, duration: 0.7, ease: 'power2.out', immediateRender: false }, 'reveal+=0.75');
        tl.to(q('.ep-story-split-label'), { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.15 }, 'reveal+=1.3');
        // the worker disguise falls away — hood up, colours drain to charcoal
        tl.to(rig, { mask: 1, duration: 0.9, ease: 'power2.inOut' }, 'reveal+=0.7');

        /* 07 — the right way: warmth, clean check, the door opens */
        tl.addLabel('turn', 15.2);
        showCap(tl, 6, 'turn');
        camTo(tl, K.turn, 'turn+=0.2', 1.8);
        tl.to(q('.ep-story-split'), { autoAlpha: 0, y: -50, duration: 0.7 }, 'turn');
        tl.to(q('.ep-story-split-label'), { autoAlpha: 0, duration: 0.4 }, 'turn');
        tl.to(rig, { cold: 0, warm: 1, lamp: 0.75, duration: 1.4 }, 'turn');
        tl.to(rig, { v1x: -7.5, v1o: 0, duration: 1 }, 'turn');
        tl.to(rig, { v2o: 1, duration: 0.25 }, 'turn+=0.5');
        tl.to(rig, { v2x: -1.25, duration: 1.4, ease: 'power1.inOut' }, 'turn+=0.5');
        tl.to(q('.ep-story-panel-clear'), { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out' }, 'turn+=1.3');
        ['aadhaar2', 'address2', 'refs2', 'pan2'].forEach((r, i) => {
          const row = `[data-row="${r}"]`;
          const at = `turn+=${1.9 + i * 0.3}`;
          tl.to(row, { autoAlpha: 1, x: 0, duration: 0.3 }, at);
          tl.to(`${row} .ep-story-row-spinner`, { autoAlpha: 0, duration: 0.15 }, `${at}+=0.22`);
          tl.to(`${row} .ep-story-row-mark`, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, `${at}+=0.22`);
        });
        tl.to(q('.ep-story-verified'), { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)' }, 'turn+=3.2');
        tl.to(rig, { door: 1, duration: 1.4, ease: 'power2.inOut' }, 'turn+=2.6');

        /* 08 — CTA */
        tl.addLabel('cta', 19.4);
        camTo(tl, K.cta, 'cta', 1.6);
        tl.to(caps[6], { autoAlpha: 0, y: -18, duration: 0.4 }, 'cta');
        tl.to(q('.ep-story-panel-clear'), { autoAlpha: 0, y: -40, duration: 0.6 }, 'cta');
        tl.to(q('.ep-story-cta'), { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 'cta+=0.3');
        tl.to({}, { duration: 0.9 });

        /* Dev-only: seek the story to a progress [0..1] without scrolling,
           so visual states can be captured deterministically. */
        if (process.env.NODE_ENV !== 'production') {
          const w = window as unknown as Record<string, unknown>;
          w.__storyRig = rig;
          const stage = q('.ep-story-stage')[0] as HTMLElement;
          w.__storySeek = (p: number) => {
            tl.scrollTrigger?.disable(false, false);
            gsap.set(stage, { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 40 });
            tl.progress(p);
          };
          w.__storyResume = () => {
            gsap.set(stage, { clearProps: 'position,top,left,width,height,zIndex' });
            tl.scrollTrigger?.enable();
          };
        }

        return () => {};
      },
      el,
    );

    return () => mm.revert();
  }, []);

  return (
    <section className="ep-story" ref={root} aria-label="How Recrify works — a short story">
      {/* Screen-reader narrative (visual scene is decorative) */}
      <p className="ep-sr-only">
        A short illustrated story: a man arrives at a home presenting as a
        maintenance worker, with a perfect ID and references. An Recrify
        identity check passes the Aadhaar name match, address history and
        reference callback — but the PAN is registered to a different person.
        The documents belong to someone else; the uniform is a disguise. The
        next applicant is genuine and verifies clean in 28 seconds, and the
        door opens. Know who is at your door.
      </p>

      <div className="ep-story-stage" aria-hidden="true">
        {/* ============================ 3D SCENE ============================ */}
        <div className="ep-story-3d">
          {scene === 'motion' && <StoryScene3D rig={rigRef.current} />}
        </div>

        {/* =========================== DOM OVERLAYS ========================== */}

        {/* the paperwork */}
        <div className="ep-story-docs">
          <div className="ep-story-doc ep-story-doc-id">
            <div className="ep-story-doc-head">
              <span>Identity Card</span>
              <span className="ep-story-doc-chip">GOVT ISSUED</span>
            </div>
            <div className="ep-story-doc-body">
              <AvatarGlyph variant="a" className="ep-story-doc-photo" />
              <div className="ep-story-doc-fields">
                <div className="ep-story-doc-name">Ravi K. Sharma</div>
                <div className="ep-story-doc-field"><i>DOB</i> 14 · 03 · 1988</div>
                <div className="ep-story-doc-field"><i>ID</i> XXXX XXXX 4821</div>
              </div>
            </div>
          </div>
          <div className="ep-story-doc ep-story-doc-ref">
            <div className="ep-story-doc-head">
              <span>Reference Letter</span>
              <span className="ep-story-doc-chip ep-story-doc-chip-green">9 YRS EXP</span>
            </div>
            <div className="ep-story-doc-lines">
              <i style={{ width: '92%' }} /><i style={{ width: '84%' }} /><i style={{ width: '88%' }} /><i style={{ width: '58%' }} />
            </div>
            <svg className="ep-story-doc-sign" viewBox="0 0 120 26" aria-hidden="true">
              <path d="M6 18c10-12 16-10 20-4s10 6 16-2 12-8 18 0 12 8 20 2 16-10 24-4" fill="none" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* the check — run 1 */}
        <div className="ep-story-panel ep-story-panel-run">
          <div className="ep-story-panel-top">
            <span className="ep-story-panel-brand">recrify</span>
            <span className="ep-story-panel-kind">identity check</span>
          </div>
          <div className="ep-story-panel-subject">
            <AvatarGlyph variant="a" className="ep-story-panel-avatar" />
            <div>
              <div className="ep-story-panel-name">Ravi K. Sharma</div>
              <div className="ep-story-panel-meta">Applicant · Maintenance & repairs</div>
            </div>
          </div>
          <div className="ep-story-panel-rows">
            <CheckRow id="aadhaar" label="Aadhaar name match" state="pass" note="matched" />
            <CheckRow id="address" label="Address history" state="pass" note="7 yrs · verified" />
            <CheckRow id="refs" label="Reference callback" state="pass" note="2 of 2 reached" />
            <CheckRow id="pan" label="PAN ↔ identity link" state="fail" note="different person" />
          </div>
          <div className="ep-story-alert">
            <Cross className="ep-story-alert-icon" />
            <span><b>Identity mismatch.</b> These documents are registered to someone else.</span>
          </div>
        </div>

        {/* the reveal — card torn in two */}
        <div className="ep-story-split">
          <div className="ep-story-split-card">
            <div className="ep-story-split-half ep-story-split-half-l">
              <AvatarGlyph variant="b" className="ep-story-split-photo" />
              <div className="ep-story-split-cap">at your door</div>
            </div>
            <div className="ep-story-split-seam" />
            <div className="ep-story-split-half ep-story-split-half-r">
              <div className="ep-story-split-name">Ravi K. Sharma</div>
              <div className="ep-story-split-row"><i>DOB</i> 14 · 03 · 1988</div>
              <div className="ep-story-split-row"><i>ID</i> XXXX XXXX 4821</div>
              <AvatarGlyph variant="a" className="ep-story-split-photo-sm" />
              <div className="ep-story-split-cap">on record</div>
            </div>
          </div>
          <div className="ep-story-split-labels">
            <span className="ep-story-split-label">who showed up</span>
            <span className="ep-story-split-label ep-story-split-label-r">who the papers belong to</span>
          </div>
        </div>

        {/* the check — run 2, clean */}
        <div className="ep-story-panel ep-story-panel-clear">
          <div className="ep-story-panel-top">
            <span className="ep-story-panel-brand">recrify</span>
            <span className="ep-story-panel-kind">identity check</span>
          </div>
          <div className="ep-story-panel-subject">
            <AvatarGlyph variant="c" className="ep-story-panel-avatar" />
            <div>
              <div className="ep-story-panel-name">Anita Deshmukh</div>
              <div className="ep-story-panel-meta">Applicant · House help & caretaking</div>
            </div>
          </div>
          <div className="ep-story-panel-rows">
            <CheckRow id="aadhaar2" label="Aadhaar name match" state="pass" note="matched" />
            <CheckRow id="address2" label="Address history" state="pass" note="11 yrs · verified" />
            <CheckRow id="refs2" label="Reference callback" state="pass" note="3 of 3 reached" />
            <CheckRow id="pan2" label="PAN ↔ identity link" state="pass" note="same person" />
          </div>
          <div className="ep-story-verified">
            <Tick className="ep-story-verified-icon" />
            <span>Verified in <b>28 seconds</b></span>
          </div>
        </div>

        {/* captions */}
        <div className="ep-story-captions">
          {CAPTIONS.map((c) => (
            <div className="ep-story-cap" key={c.k}>
              <span className="ep-story-cap-k">{c.k}</span>
              <p className="ep-story-cap-t">{c.t}</p>
            </div>
          ))}
        </div>

        {/* closing CTA */}
        <div className="ep-story-cta">
          <h2 className="ep-story-cta-title">Know who&rsquo;s at your door.</h2>
          <p className="ep-story-cta-sub">
            Identity, records and references — verified before they&rsquo;re inside.
          </p>
          <div className="ep-story-cta-actions">
            <Link className="ep-btn ep-btn-primary ep-btn-lg" href="/login">
              Verify Now
            </Link>
            <a className="ep-btn ep-btn-ghost ep-btn-lg ep-story-cta-ghost" href="#how">
              See how it works
            </a>
          </div>
        </div>

        {/* scroll hint, visible only at the very start */}
        <div className="ep-story-hint">scroll</div>
      </div>
    </section>
  );
}
