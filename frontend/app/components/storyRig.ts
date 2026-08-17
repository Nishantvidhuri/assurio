/* Shared mutable animation rig for the home-page story.
   GSAP (HomeStory) writes values on a scroll-scrubbed timeline;
   the R3F scene (StoryScene3D) reads them per frame. */

export type StoryRig = {
  cam: {
    x: number; y: number; z: number;      // camera position
    tx: number; ty: number; tz: number;   // look-at target
    fov: number;
  };
  door: number;   // 0 closed → 1 open
  knock: number;  // ripple pulse 0→1 (retriggered)
  v1x: number;    // visitor 1 walk offset
  v1o: number;    // visitor 1 opacity
  v2x: number;
  v2o: number;
  lamp: number;   // porch lamp 0→1
  warm: number;   // celebration warmth 0→1
  cold: number;   // alarm mood 0→1
  mask: number;   // visitor 1 disguise: 0 worker → 1 hooded intruder
};

export function createRig(mobile: boolean): StoryRig {
  return {
    cam: mobile
      ? { x: -5.2, y: 4.0, z: 17.5, tx: 0.2, ty: 1.5, tz: 0, fov: 40 }
      : { x: -8.6, y: 4.6, z: 15.2, tx: 0.4, ty: 1.5, tz: 0, fov: 34 },
    door: 0,
    knock: 0,
    v1x: -7,
    v1o: 0,
    v2x: -7,
    v2o: 0,
    lamp: 0.12,
    warm: 0,
    cold: 0,
    mask: 0,
  };
}
