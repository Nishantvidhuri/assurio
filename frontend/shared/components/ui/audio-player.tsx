'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

// Dependency-free audio player with a faux-waveform (CSS bars), play/pause,
// seekable progress, and mm:ss / mm:ss time. The "waveform" is decorative —
// deterministic bar heights, with the played portion tinted. The source can
// be passed directly via `src`, or resolved lazily on first play via
// `onRequestSrc` (used for short-lived presigned recording URLs).
export interface AudioPlayerProps {
  src?: string | null;
  onRequestSrc?: () => Promise<string | null>;
  // Total length shown before the audio metadata loads (e.g. CDR duration).
  durationSeconds?: number | null;
  className?: string;
}

// Each bar is 2px wide with a 2px gap → a 4px pitch. The bar count is derived
// from the measured track width so density stays constant at any size.
const BAR_PITCH_PX = 4;

// Stable pseudo-waveform height (35%–~95%) for a bar index — deterministic so
// the bars look organic without reshuffling on every render.
function barHeight(index: number): number {
  const wave = Math.sin(index * 0.6) * 0.5 + Math.sin(index * 1.7) * 0.3;
  return 0.35 + Math.abs(wave) * 0.6;
}

export function AudioPlayer({
  src,
  onRequestSrc,
  durationSeconds,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(src ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const [barCount, setBarCount] = useState(0);

  useEffect(() => {
    if (src) setResolvedSrc(src);
  }, [src]);

  // Fill the track with as many bars as fit, recomputing when the container
  // resizes — so the player keeps the same bar density in any width.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () =>
      setBarCount(Math.max(1, Math.floor(el.clientWidth / BAR_PITCH_PX)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ensureSrc = useCallback(async (): Promise<string | null> => {
    if (resolvedSrc) return resolvedSrc;
    if (!onRequestSrc) return null;
    setLoading(true);
    try {
      const url = await onRequestSrc();
      if (url) setResolvedSrc(url);
      return url;
    } catch {
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [resolvedSrc, onRequestSrc]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (isPlaying) {
      audio?.pause();
      return;
    }
    const url = await ensureSrc();
    if (!url) return;
    // Wait a tick for the <audio src> to bind before play().
    requestAnimationFrame(() => {
      audioRef.current?.play().catch(() => setError(true));
    });
  }, [isPlaying, ensureSrc]);

  const handleSeek = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const fraction = Math.min(
        1,
        Math.max(0, (event.clientX - rect.left) / rect.width),
      );
      audio.currentTime = fraction * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );

  const playedFraction = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md bg-neutral-200 p-4',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => void togglePlay()}
        disabled={loading || error}
        aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
        className="flex size-6 shrink-0 items-center justify-center text-primary transition-colors hover:text-primary-700 disabled:text-text-disabled"
      >
        {loading ? (
          <Loader2 className="size-6 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-6 fill-current" />
        ) : (
          <Play className="size-6 fill-current" />
        )}
      </button>

      <div
        ref={trackRef}
        className="flex h-7 flex-1 items-center gap-[2px] overflow-hidden"
        onClick={handleSeek}
        role="presentation"
      >
        {Array.from({ length: barCount }, (_, index) => {
          const played = index / barCount <= playedFraction;
          return (
            <span
              key={index}
              className={cn(
                'w-[2px] shrink-0 rounded-full',
                played ? 'bg-primary' : 'bg-neutral-600',
              )}
              style={{ height: `${Math.round(barHeight(index) * 100)}%` }}
            />
          );
        })}
      </div>

      <span
        className={cn(
          'shrink-0 text-body-sm font-medium tabular-nums tracking-body-sm',
          error ? 'text-text-subheading' : 'text-text-body',
        )}
      >
        {error
          ? 'Unavailable'
          : `${formatTime(currentTime)} / ${formatTime(duration)}`}
      </span>

      {resolvedSrc ? (
        <audio
          ref={audioRef}
          src={resolvedSrc}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
          // Browsers may only resolve a streamed MP3's real length a beat after
          // metadata — adopt it so the total + scrubber reflect the true audio.
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
          onError={() => setError(true)}
        />
      ) : null}
    </div>
  );
}

function formatTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
