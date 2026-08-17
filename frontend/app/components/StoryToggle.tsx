'use client';

/* Floating control that turns the scroll-driven 3D story on or off.

   The 3D story is expensive (WebGL canvas, pinned scroll, ~3MB of model), so
   it is genuinely optional: switching it off unmounts the whole section and
   the page falls back to the standard marketing layout. */

import { Switch } from '@/shared/components/ui';

export default function StoryToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="ep-3dtoggle">
      <label className="ep-3dtoggle-inner">
        <span className="ep-3dtoggle-text">
          <span className="ep-3dtoggle-title">3D story</span>
          <span className="ep-3dtoggle-hint">{on ? 'On' : 'Off'}</span>
        </span>
        <Switch
          checked={on}
          onChange={(e) => onToggle(e.currentTarget.checked)}
          aria-label="Show the 3D scroll story on the home page"
        />
      </label>
    </div>
  );
}
