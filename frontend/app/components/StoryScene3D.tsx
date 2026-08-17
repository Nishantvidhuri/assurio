'use client';

/* ============================================================================
   StoryScene3D — light "clay render" porch scene for the home story.
   Reads all animated values from a shared StoryRig each frame (GSAP writes
   them on a scroll-scrubbed timeline in HomeStory.tsx).
   Built from rounded primitives — no external models, textures or fonts.

   Cast:
   - Visitor 1: a man presenting as a maintenance worker (cap, overalls,
     toolbox, folder of references). At the reveal his disguise crossfades
     into a dark hooded figure — the person the papers were hiding.
   - Visitor 2: the genuine applicant, verified clean.
   ========================================================================== */

import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, type RootState } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import StoryHuman from './StoryHuman';
import type { StoryRig } from './storyRig';

/* Dev-only: allows rendering a single frame synchronously (no rAF), so the
   scene can be captured deterministically even in a throttled/hidden tab.
   Registered in onCreated because the R3F tree itself only commits on the
   first rAF tick, which never arrives while the pane is hidden. */

/* ------------------------------- palette ---------------------------------- */

const C = {
  wall: '#f6f2e9',
  wallShade: '#ece6d8',
  trim: '#ffffff',
  roof: '#31405f',
  roofRidge: '#28354f',
  door: '#22407a',
  doorPanel: '#2c4d8c',
  knob: '#c9a25e',
  glassWarm: '#ffedc2',
  shutter: '#5b7db8',
  ground: '#edeff8',
  lawn: '#dde9db',
  stone: '#e2e5f1',
  mat: '#31508f',
  matBorder: '#dce4f8',
  pot: '#c98d6b',
  potRim: '#b87c5c',
  leaf: '#94c29e',
  leafDark: '#6ca383',
  skin: '#e0a983',
  hair: '#3c2e26',
  // worker disguise
  workBlue: '#4a6fa5',
  workShirt: '#d9d2c4',
  workPants: '#3c4a63',
  toolbox: '#a3502e',
  folder: '#31508f',
  // hooded reveal
  hood: '#262a33',
  hoodDark: '#1c1f27',
  // genuine applicant
  kurta: '#4f9e8c',
  satchel: '#8a6a4f',
  interior: '#ffd9a0',
  hillFar: '#d6dfee',
  hillMid: '#cdd9e9',
  hillGreen: '#d3e2d3',
  cloud: '#ffffff',
  trunk: '#9a7355',
  fence: '#f4f2ec',
} as const;

const std = (color: string, opts: Record<string, unknown> = {}) => (
  <meshStandardMaterial color={color} roughness={0.92} metalness={0} {...opts} />
);

/* ------------------------------ camera rig -------------------------------- */

function CameraRig({ rig }: { rig: StoryRig }) {
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.position.set(rig.cam.x, rig.cam.y, rig.cam.z);
    target.set(rig.cam.tx, rig.cam.ty, rig.cam.tz);
    camera.lookAt(target);
    const persp = camera as THREE.PerspectiveCamera;
    if (Math.abs(persp.fov - rig.cam.fov) > 0.05) {
      persp.fov = rig.cam.fov;
      persp.updateProjectionMatrix();
    }
  });
  return null;
}

/* -------------------------------- lights ---------------------------------- */

function Lights({ rig }: { rig: StoryRig }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const porch = useRef<THREE.PointLight>(null);
  const alarm = useRef<THREE.PointLight>(null);
  const doorway = useRef<THREE.SpotLight>(null);

  const cWarmKey = useMemo(() => new THREE.Color('#fff2df'), []);
  const cColdKey = useMemo(() => new THREE.Color('#d7e2fa'), []);
  const cWarmAmb = useMemo(() => new THREE.Color('#ffffff'), []);
  const cColdAmb = useMemo(() => new THREE.Color('#dce4f8'), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (key.current) {
      key.current.intensity = 1.3 - rig.cold * 0.6 + rig.warm * 0.15;
      key.current.color.copy(tmp.lerpColors(cWarmKey, cColdKey, rig.cold));
    }
    if (amb.current) {
      amb.current.intensity = 0.6 - rig.cold * 0.2 + rig.warm * 0.08;
      amb.current.color.copy(tmp.lerpColors(cWarmAmb, cColdAmb, rig.cold));
    }
    if (porch.current) porch.current.intensity = rig.lamp * 2.2 + rig.warm * 0.7;
    if (alarm.current) alarm.current.intensity = rig.cold * 1.6;
    if (doorway.current) doorway.current.intensity = rig.door * 2.6 + rig.warm * 0.5;
  });

  return (
    <>
      <ambientLight ref={amb} intensity={0.6} />
      <directionalLight
        ref={key}
        position={[6.5, 8.5, 6]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-4}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[-5, 4, 3]} intensity={0.3} color="#e8eeff" />
      <pointLight ref={porch} position={[-1.05, 2.5, 0.6]} color="#ffbf72" distance={7} decay={1.8} />
      <pointLight ref={alarm} position={[1.8, 1.7, 2.6]} color="#e5484d" distance={7} decay={1.8} intensity={0} />
      <spotLight
        ref={doorway}
        position={[0, 1.9, -0.45]}
        angle={0.85}
        penumbra={0.7}
        color="#ffcf8f"
        intensity={0}
        distance={8}
        target-position={[0.2, 0.2, 3]}
      />
    </>
  );
}

/* --------------------------------- house ---------------------------------- */

function House({ rig }: { rig: StoryRig }) {
  const doorGroup = useRef<THREE.Group>(null);
  const glowMat = useRef<THREE.MeshStandardMaterial>(null);
  const transomMat = useRef<THREE.MeshStandardMaterial>(null);
  const lanternMat = useRef<THREE.MeshStandardMaterial>(null);
  const lantern = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (doorGroup.current) {
      doorGroup.current.rotation.y = -rig.door * 1.75;
      doorGroup.current.position.z = -Math.sin(Math.min(rig.knock, 1) * Math.PI) * 0.02;
    }
    if (glowMat.current) glowMat.current.emissiveIntensity = 0.45 + rig.door * 1.6 + rig.warm * 0.5;
    if (transomMat.current) transomMat.current.emissiveIntensity = 0.25 + rig.lamp * 0.75;
    if (lanternMat.current) lanternMat.current.emissiveIntensity = 0.25 + rig.lamp * 2.6;
    if (lantern.current) lantern.current.rotation.z = Math.sin(clock.elapsedTime * 1.1) * 0.05;
  });

  return (
    <group>
      {/* facade around the door opening (door: x -0.55…0.55, h 2.25) */}
      <RoundedBox args={[2.65, 3.5, 0.26]} radius={0.05} smoothness={4} position={[-1.875, 1.75, -0.13]} castShadow receiveShadow>
        {std(C.wall)}
      </RoundedBox>
      <RoundedBox args={[4.25, 3.5, 0.26]} radius={0.05} smoothness={4} position={[2.675, 1.75, -0.13]} castShadow receiveShadow>
        {std(C.wall)}
      </RoundedBox>
      <RoundedBox args={[1.14, 1.2, 0.26]} radius={0.05} smoothness={4} position={[0, 2.9, -0.13]} castShadow receiveShadow>
        {std(C.wall)}
      </RoundedBox>

      {/* side returns */}
      <RoundedBox args={[0.26, 3.5, 2.4]} radius={0.05} smoothness={4} position={[-3.2, 1.75, -1.2]} castShadow receiveShadow>
        {std(C.wallShade)}
      </RoundedBox>
      <RoundedBox args={[0.26, 3.5, 2.4]} radius={0.05} smoothness={4} position={[4.8, 1.75, -1.2]} castShadow receiveShadow>
        {std(C.wallShade)}
      </RoundedBox>

      {/* pitched roof */}
      <group position={[0.8, 3.42, -0.85]}>
        <RoundedBox args={[9.2, 0.16, 2.1]} radius={0.04} smoothness={4} position={[0, 0.42, 0.86]} rotation={[0.42, 0, 0]} castShadow>
          {std(C.roof)}
        </RoundedBox>
        <RoundedBox args={[9.2, 0.16, 2.1]} radius={0.04} smoothness={4} position={[0, 0.42, -0.86]} rotation={[-0.42, 0, 0]} castShadow>
          {std(C.roof)}
        </RoundedBox>
        <mesh position={[0, 0.85, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 9.25, 12]} />
          {std(C.roofRidge)}
        </mesh>
      </group>
      {/* chimney */}
      <RoundedBox args={[0.5, 1.1, 0.5]} radius={0.04} smoothness={4} position={[3.1, 4.05, -0.85]} castShadow>
        {std(C.wallShade)}
      </RoundedBox>
      <RoundedBox args={[0.62, 0.16, 0.62]} radius={0.04} smoothness={4} position={[3.1, 4.62, -0.85]} castShadow>
        {std(C.roofRidge)}
      </RoundedBox>

      {/* porch canopy over the door */}
      <group position={[0, 2.62, 0.62]}>
        {/* gable board closing the wedge between the slabs */}
        <RoundedBox args={[2.04, 0.52, 0.05]} radius={0.02} smoothness={2} position={[0, 0.24, -0.3]}>
          {std('#3a4c74')}
        </RoundedBox>
        <RoundedBox args={[2.1, 0.1, 1.15]} radius={0.03} smoothness={4} position={[0, 0.28, 0.28]} rotation={[0.36, 0, 0]} castShadow>
          {std(C.roof)}
        </RoundedBox>
        <RoundedBox args={[2.1, 0.1, 1.15]} radius={0.03} smoothness={4} position={[0, 0.28, -0.28]} rotation={[-0.36, 0, 0]} castShadow>
          {std(C.roof)}
        </RoundedBox>
        <mesh position={[0, 0.48, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 2.14, 10]} />
          {std(C.roofRidge)}
        </mesh>
      </group>
      {/* canopy brackets (wall-mounted — no posts blocking the view) */}
      {[-0.92, 0.92].map((x) => (
        <mesh key={x} position={[x, 2.4, 0.36]} rotation={[0.72, 0, 0]} castShadow>
          <boxGeometry args={[0.07, 0.62, 0.07]} />
          {std(C.trim)}
        </mesh>
      ))}

      {/* interior seen through the doorway */}
      <mesh position={[0, 1.1, -0.55]}>
        <planeGeometry args={[1.04, 2.2]} />
        <meshStandardMaterial ref={glowMat} color={C.interior} emissive={C.interior} emissiveIntensity={0.45} />
      </mesh>

      {/* door frame trim */}
      <RoundedBox args={[0.12, 2.34, 0.12]} radius={0.03} smoothness={4} position={[-0.61, 1.13, 0.02]} castShadow>
        {std(C.trim)}
      </RoundedBox>
      <RoundedBox args={[0.12, 2.34, 0.12]} radius={0.03} smoothness={4} position={[0.61, 1.13, 0.02]} castShadow>
        {std(C.trim)}
      </RoundedBox>
      <RoundedBox args={[1.36, 0.14, 0.12]} radius={0.03} smoothness={4} position={[0, 2.33, 0.02]} castShadow>
        {std(C.trim)}
      </RoundedBox>

      {/* transom above the door */}
      <RoundedBox args={[0.74, 0.36, 0.07]} radius={0.03} smoothness={4} position={[0, 2.66, 0.01]}>
        <meshStandardMaterial ref={transomMat} color={C.glassWarm} emissive={C.glassWarm} emissiveIntensity={0.3} />
      </RoundedBox>

      {/* the door — hinged at its left edge */}
      <group position={[-0.55, 0, 0]}>
        <group ref={doorGroup}>
          <RoundedBox args={[1.1, 2.25, 0.08]} radius={0.03} smoothness={4} position={[0.55, 1.125, 0]} castShadow>
            {std(C.door)}
          </RoundedBox>
          {[
            [1.66, 0.62, 0.3],
            [0.86, 0.62, 0.3],
            [1.66, 0.62, 0.8],
            [0.86, 0.62, 0.8],
          ].map(([y, h, cx], i) => (
            <RoundedBox key={i} args={[0.34, h, 0.02]} radius={0.008} smoothness={2} position={[cx, y, 0.045]}>
              {std(C.doorPanel)}
            </RoundedBox>
          ))}
          <mesh position={[0.97, 1.08, 0.07]} castShadow>
            <sphereGeometry args={[0.05, 20, 20]} />
            {std(C.knob, { metalness: 0.7, roughness: 0.3 })}
          </mesh>
          {/* number plate */}
          <RoundedBox args={[0.22, 0.13, 0.02]} radius={0.01} smoothness={2} position={[0.55, 1.95, 0.05]}>
            {std(C.knob, { metalness: 0.5, roughness: 0.45 })}
          </RoundedBox>
        </group>
      </group>

      {/* windows with shutters */}
      <CottageWindow x={2.55} y={1.8} w={1.3} h={1.45} rig={rig} />
      <CottageWindow x={-2.05} y={1.9} w={0.9} h={1.0} rig={rig} />

      {/* porch lantern (left of door, under canopy) */}
      <group position={[-1.05, 2.3, 0.18]}>
        <RoundedBox args={[0.07, 0.07, 0.34]} radius={0.02} smoothness={2} position={[0, 0.12, 0.1]} castShadow>
          {std('#3a3f52')}
        </RoundedBox>
        <group ref={lantern} position={[0, 0, 0.3]}>
          <RoundedBox args={[0.17, 0.26, 0.17]} radius={0.03} smoothness={3} castShadow>
            <meshStandardMaterial ref={lanternMat} color="#ffe9c4" emissive="#ffc677" emissiveIntensity={0.4} />
          </RoundedBox>
          <mesh position={[0, 0.18, 0]} castShadow>
            <coneGeometry args={[0.15, 0.12, 8]} />
            {std('#3a3f52')}
          </mesh>
        </group>
      </group>

      {/* step + doormat */}
      <RoundedBox args={[1.9, 0.2, 1.05]} radius={0.05} smoothness={4} position={[0, 0.1, 0.65]} castShadow receiveShadow>
        {std(C.stone)}
      </RoundedBox>
      <RoundedBox args={[1.18, 0.035, 0.74]} radius={0.015} smoothness={2} position={[0, 0.215, 0.66]} receiveShadow>
        {std(C.matBorder)}
      </RoundedBox>
      <RoundedBox args={[1.06, 0.04, 0.62]} radius={0.015} smoothness={2} position={[0, 0.225, 0.66]} receiveShadow>
        {std(C.mat)}
      </RoundedBox>

      {/* plants + flowers */}
      <PottedPlant x={1.18} z={0.8} s={1} />
      <PottedPlant x={3.7} z={0.55} s={1.4} />
      <PottedPlant x={-2.9} z={0.6} s={1.15} />
      {[
        [1.6, 1.35, '#e8a3b4'], [2.0, 1.15, '#f2d06b'], [-1.9, 1.5, '#e8a3b4'],
        [-2.4, 1.2, '#f2d06b'], [3.3, 1.3, '#e8a3b4'],
      ].map(([x, z, col], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <mesh position={[0, 0.09, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
            {std('#7fa989')}
          </mesh>
          <mesh position={[0, 0.2, 0]} castShadow>
            <sphereGeometry args={[0.045, 10, 10]} />
            {std(col as string)}
          </mesh>
        </group>
      ))}

      {/* stepping stones */}
      {[
        [0.08, 1.75, 0], [-0.16, 2.6, 0.1], [0.14, 3.45, -0.06], [-0.1, 4.3, 0.04],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x, 0.035, z]} rotation={[0, r, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.36 - i * 0.015, 0.38 - i * 0.015, 0.07, 22]} />
          {std(C.stone)}
        </mesh>
      ))}
    </group>
  );
}

function CottageWindow({ x, y, w, h, rig }: { x: number; y: number; w: number; h: number; rig: StoryRig }) {
  const glass = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (glass.current) glass.current.emissiveIntensity = 0.22 + rig.lamp * 0.5 + rig.warm * 0.5;
  });
  return (
    <group position={[x, y, 0]}>
      <RoundedBox args={[w + 0.18, h + 0.18, 0.09]} radius={0.03} smoothness={3} position={[0, 0, 0.02]} castShadow>
        {std(C.trim)}
      </RoundedBox>
      <mesh position={[0, 0, 0.075]}>
        <boxGeometry args={[w, h, 0.03]} />
        <meshStandardMaterial ref={glass} color={C.glassWarm} emissive={C.glassWarm} emissiveIntensity={0.25} />
      </mesh>
      <RoundedBox args={[0.05, h, 0.015]} radius={0.005} smoothness={2} position={[0, 0, 0.095]}>
        {std(C.trim)}
      </RoundedBox>
      <RoundedBox args={[w, 0.05, 0.015]} radius={0.005} smoothness={2} position={[0, 0, 0.095]}>
        {std(C.trim)}
      </RoundedBox>
      {/* shutters */}
      <RoundedBox args={[0.24, h + 0.06, 0.05]} radius={0.02} smoothness={2} position={[-(w / 2 + 0.24), 0, 0.03]} castShadow>
        {std(C.shutter)}
      </RoundedBox>
      <RoundedBox args={[0.24, h + 0.06, 0.05]} radius={0.02} smoothness={2} position={[w / 2 + 0.24, 0, 0.03]} castShadow>
        {std(C.shutter)}
      </RoundedBox>
      {/* flower box */}
      <RoundedBox args={[w * 0.95, 0.17, 0.22]} radius={0.03} smoothness={3} position={[0, -h / 2 - 0.16, 0.15]} castShadow>
        {std(C.pot)}
      </RoundedBox>
      {[-w * 0.28, 0, w * 0.28].map((fx, i) => (
        <mesh key={i} position={[fx, -h / 2 - 0.05, 0.15]} castShadow>
          <sphereGeometry args={[0.085, 12, 12]} />
          {std(i === 1 ? C.leafDark : C.leaf)}
        </mesh>
      ))}
    </group>
  );
}

function PottedPlant({ x, z, s }: { x: number; z: number; s: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.13, 0.34, 18]} />
        {std(C.pot)}
      </mesh>
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.17, 0.05, 18]} />
        {std(C.potRim)}
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <sphereGeometry args={[0.24, 14, 12]} />
        {std(C.leaf)}
      </mesh>
      <mesh position={[0.11, 0.68, 0.03]} castShadow>
        <sphereGeometry args={[0.16, 12, 10]} />
        {std(C.leafDark)}
      </mesh>
      <mesh position={[-0.1, 0.64, -0.04]} castShadow>
        <sphereGeometry args={[0.13, 12, 10]} />
        {std(C.leaf)}
      </mesh>
    </group>
  );
}

/* -------------------------------- people ----------------------------------- */

type PersonProps = {
  rig: StoryRig;
  who: 1 | 2;
};

/* A stylized person (~1.8 units tall), built from rounded primitives.
   who=1: maintenance-worker disguise (cap, overalls, toolbox) that
          crossfades to a hooded figure as rig.mask goes 0→1.
   who=2: the genuine applicant (kurta, hair bun, satchel). */
function Person({ rig, who }: PersonProps) {
  const group = useRef<THREE.Group>(null);
  const lastX = useRef(-7);

  // materials we retint / fade
  const fade = useRef<THREE.MeshStandardMaterial[]>([]);
  const disguise = useRef<THREE.MeshStandardMaterial[]>([]);
  const capMat = useRef<THREE.MeshStandardMaterial>(null);
  const capMat2 = useRef<THREE.MeshStandardMaterial>(null);
  const hoodMats = useRef<THREE.MeshStandardMaterial[]>([]);

  const cWork = useMemo(() => new THREE.Color(C.workBlue), []);
  const cShirt = useMemo(() => new THREE.Color(C.workShirt), []);
  const cPants = useMemo(() => new THREE.Color(C.workPants), []);
  const cHood = useMemo(() => new THREE.Color(C.hood), []);
  const cHoodDark = useMemo(() => new THREE.Color(C.hoodDark), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  const collectFade = (m: THREE.MeshStandardMaterial | null) => {
    if (m && !fade.current.includes(m)) {
      m.transparent = true;
      m.opacity = 0;
      fade.current.push(m);
    }
  };
  const collectDisguise = (kind: 'blue' | 'shirt' | 'pants') => (m: THREE.MeshStandardMaterial | null) => {
    if (m && !disguise.current.includes(m)) {
      m.userData.kind = kind;
      disguise.current.push(m);
    }
    collectFade(m);
  };
  const collectHood = (m: THREE.MeshStandardMaterial | null) => {
    if (m && !hoodMats.current.includes(m)) {
      m.transparent = true;
      m.opacity = 0;
      hoodMats.current.push(m);
    }
  };

  useFrame(({ clock }) => {
    const x = who === 1 ? rig.v1x : rig.v2x;
    const o = who === 1 ? rig.v1o : rig.v2o;
    const mask = who === 1 ? rig.mask : 0;
    if (!group.current) return;

    const dx = Math.abs(x - lastX.current);
    lastX.current = x;
    const walking = dx > 0.0004;
    const bob = walking ? Math.abs(Math.sin(x * 5.4)) * 0.045 : Math.sin(clock.elapsedTime * 1.6) * 0.008;
    group.current.position.set(x, bob, 1.05);

    const settle = THREE.MathUtils.clamp(1 - Math.abs(-1.3 - x) / 2.4, 0, 1);
    group.current.rotation.y = THREE.MathUtils.lerp(Math.PI / 2, Math.PI * 0.86, settle);
    group.current.visible = o > 0.01;

    for (const m of fade.current) m.opacity = o;
    for (const m of hoodMats.current) m.opacity = o * mask;
    if (capMat.current) capMat.current.opacity = o * (1 - mask);
    if (capMat2.current) capMat2.current.opacity = o * (1 - mask);
    for (const m of disguise.current) {
      const kind = m.userData.kind as 'blue' | 'shirt' | 'pants';
      const base = kind === 'blue' ? cWork : kind === 'shirt' ? cShirt : cPants;
      m.color.copy(tmp.lerpColors(base, kind === 'pants' ? cHoodDark : cHood, mask));
    }
  });

  const skin = C.skin;
  const topColor = who === 1 ? C.workBlue : C.kurta;

  return (
    <group ref={group}>
      {/* shoes */}
      {[-0.11, 0.11].map((sx) => (
        <RoundedBox key={sx} args={[0.15, 0.1, 0.3]} radius={0.04} smoothness={3} position={[sx, 0.05, 0.04]} castShadow>
          <meshStandardMaterial ref={collectFade} color="#3a3228" roughness={0.85} />
        </RoundedBox>
      ))}
      {/* legs */}
      {[-0.105, 0.105].map((sx) => (
        <mesh key={sx} position={[sx, 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.077, 0.52, 6, 14]} />
          <meshStandardMaterial ref={collectDisguise('pants')} color={C.workPants} roughness={0.92} />
        </mesh>
      ))}
      {/* torso */}
      <mesh position={[0, 1.06, 0]} scale={[1, 1.18, 0.86]} castShadow>
        <capsuleGeometry args={[0.235, 0.42, 8, 18]} />
        <meshStandardMaterial ref={collectDisguise(who === 1 ? 'shirt' : 'blue')} color={who === 1 ? C.workShirt : C.kurta} roughness={0.92} />
      </mesh>
      {who === 1 && (
        <>
          {/* overall bib + straps */}
          <RoundedBox args={[0.34, 0.34, 0.05]} radius={0.02} smoothness={3} position={[0, 1.18, 0.21]} castShadow>
            <meshStandardMaterial ref={collectDisguise('blue')} color={C.workBlue} roughness={0.92} />
          </RoundedBox>
          <RoundedBox args={[0.5, 0.5, 0.06]} radius={0.03} smoothness={3} position={[0, 0.82, 0.17]} castShadow>
            <meshStandardMaterial ref={collectDisguise('blue')} color={C.workBlue} roughness={0.92} />
          </RoundedBox>
          {[-0.12, 0.12].map((sx) => (
            <mesh key={sx} position={[sx, 1.32, 0.1]} rotation={[0.5, 0, 0]} castShadow>
              <capsuleGeometry args={[0.028, 0.3, 4, 8]} />
              <meshStandardMaterial ref={collectDisguise('blue')} color={C.workBlue} roughness={0.92} />
            </mesh>
          ))}
        </>
      )}
      {/* arms: left holds the folder to the chest, right hangs with toolbox / satchel */}
      <group position={[-0.27, 1.32, 0]} rotation={[0, 0, 0.5]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <capsuleGeometry args={[0.062, 0.24, 6, 12]} />
          <meshStandardMaterial ref={collectDisguise('blue')} color={topColor} roughness={0.92} />
        </mesh>
        <group position={[0, -0.29, 0]} rotation={[-1.25, 0, -0.25]}>
          <mesh position={[0, -0.1, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
            <meshStandardMaterial ref={collectDisguise('blue')} color={topColor} roughness={0.92} />
          </mesh>
          <mesh position={[0, -0.23, 0]} castShadow>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial ref={collectFade} color={skin} roughness={0.8} />
          </mesh>
        </group>
      </group>
      <group position={[0.27, 1.32, 0]} rotation={[0, 0, -0.16]}>
        <mesh position={[0, -0.14, 0]} castShadow>
          <capsuleGeometry args={[0.062, 0.26, 6, 12]} />
          <meshStandardMaterial ref={collectDisguise('blue')} color={topColor} roughness={0.92} />
        </mesh>
        <mesh position={[0.01, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.2, 6, 12]} />
          <meshStandardMaterial ref={collectDisguise('blue')} color={topColor} roughness={0.92} />
        </mesh>
        <mesh position={[0.02, -0.52, 0]} castShadow>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial ref={collectFade} color={skin} roughness={0.8} />
        </mesh>
      </group>
      {/* folder pressed to the chest */}
      <RoundedBox args={[0.4, 0.3, 0.045]} radius={0.015} smoothness={3} position={[-0.1, 1.13, 0.26]} rotation={[-0.18, 0.12, 0.08]} castShadow>
        <meshStandardMaterial ref={collectFade} color={C.folder} roughness={0.85} />
      </RoundedBox>
      {/* carried item by the right hand */}
      {who === 1 ? (
        <group position={[0.34, 0.62, 0]}>
          <RoundedBox args={[0.36, 0.22, 0.15]} radius={0.03} smoothness={3} castShadow>
            <meshStandardMaterial ref={collectFade} color={C.toolbox} roughness={0.85} />
          </RoundedBox>
          <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.07, 0.018, 8, 18, Math.PI]} />
            <meshStandardMaterial ref={collectFade} color="#7c3b20" roughness={0.8} />
          </mesh>
        </group>
      ) : (
        <RoundedBox args={[0.28, 0.34, 0.13]} radius={0.03} smoothness={3} position={[0.33, 0.8, 0.05]} rotation={[0, 0, -0.1]} castShadow>
          <meshStandardMaterial ref={collectFade} color={C.satchel} roughness={0.85} />
        </RoundedBox>
      )}
      {/* neck + head */}
      <mesh position={[0, 1.52, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.1, 12]} />
        <meshStandardMaterial ref={collectFade} color={skin} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.72, 0]} scale={[1, 1.08, 1]} castShadow>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial ref={collectFade} color={skin} roughness={0.8} />
      </mesh>
      {/* simple eyes — same for both, friendly-neutral */}
      {[-0.055, 0.055].map((ex) => (
        <mesh key={ex} position={[ex, 1.73, 0.145]} castShadow={false}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshStandardMaterial ref={collectFade} color="#2b2119" roughness={0.4} />
        </mesh>
      ))}
      {who === 1 ? (
        <>
          {/* worker cap (fades out with mask) */}
          <mesh position={[0, 1.82, -0.01]} scale={[1, 0.62, 1]}>
            <sphereGeometry args={[0.175, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial ref={capMat} color={C.workBlue} roughness={0.9} transparent opacity={0} />
          </mesh>
          <mesh position={[0, 1.79, 0.15]} rotation={[-0.12, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.025, 18, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial ref={capMat2} color={C.workBlue} roughness={0.9} transparent opacity={0} />
          </mesh>
          {/* hood (fades in with mask) */}
          <mesh position={[0, 1.74, -0.03]} scale={[1.08, 1.16, 1.1]}>
            <sphereGeometry args={[0.185, 22, 16, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.72]} />
            <meshStandardMaterial ref={collectHood} color={C.hood} roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 1.48, -0.02]} rotation={[0.12, 0, 0]}>
            <coneGeometry args={[0.3, 0.34, 16, 1, true]} />
            <meshStandardMaterial ref={collectHood} color={C.hood} roughness={0.95} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : (
        <>
          {/* hair + bun */}
          <mesh position={[0, 1.79, -0.02]} scale={[1.04, 0.78, 1.04]}>
            <sphereGeometry args={[0.17, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial ref={collectFade} color={C.hair} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.78, -0.16]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial ref={collectFade} color={C.hair} roughness={0.9} />
          </mesh>
        </>
      )}
    </group>
  );
}

/* ------------------------------ environment ------------------------------- */

function Tree({ x, z, s }: { x: number; z: number; s: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 1.1, 10]} />
        {std(C.trunk)}
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow>
        <sphereGeometry args={[0.55, 14, 12]} />
        {std(C.leaf)}
      </mesh>
      <mesh position={[0.35, 1.7, 0.1]} castShadow>
        <sphereGeometry args={[0.38, 12, 10]} />
        {std(C.leafDark)}
      </mesh>
      <mesh position={[-0.32, 1.72, -0.05]} castShadow>
        <sphereGeometry args={[0.33, 12, 10]} />
        {std(C.leaf)}
      </mesh>
    </group>
  );
}

function Cloud({ x, y, z, s }: { x: number; y: number; z: number; s: number }) {
  return (
    <group position={[x, y, z]} scale={s}>
      {[[0, 0, 0, 0.6], [0.55, 0.08, 0.1, 0.42], [-0.5, 0.05, -0.05, 0.45], [0.1, 0.28, 0, 0.4]].map(([cx, cy, cz, r], i) => (
        <mesh key={i} position={[cx, cy, cz]}>
          <sphereGeometry args={[r, 14, 12]} />
          <meshStandardMaterial color={C.cloud} emissive={C.cloud} emissiveIntensity={0.35} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function FenceRun({ from, to, z }: { from: number; to: number; z: number }) {
  const pickets = [];
  for (let x = from; x <= to; x += 0.55) pickets.push(x);
  return (
    <group>
      {pickets.map((x) => (
        <RoundedBox key={x} args={[0.09, 0.52, 0.04]} radius={0.02} smoothness={2} position={[x, 0.26, z]} castShadow>
          {std(C.fence)}
        </RoundedBox>
      ))}
      <RoundedBox args={[to - from + 0.2, 0.06, 0.03]} radius={0.012} smoothness={2} position={[(from + to) / 2, 0.38, z + 0.03]}>
        {std(C.fence)}
      </RoundedBox>
      <RoundedBox args={[to - from + 0.2, 0.06, 0.03]} radius={0.012} smoothness={2} position={[(from + to) / 2, 0.16, z + 0.03]}>
        {std(C.fence)}
      </RoundedBox>
    </group>
  );
}

function Environment3D() {
  const clouds = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (clouds.current) clouds.current.position.x = Math.sin(clock.elapsedTime * 0.03) * 1.5;
  });
  return (
    <group>
      {/* distant hills, softened by fog */}
      <mesh position={[-13, -2.2, -17]} scale={[16, 5.2, 8]}>
        <sphereGeometry args={[1, 24, 16]} />
        {std(C.hillMid)}
      </mesh>
      <mesh position={[11, -2.8, -19]} scale={[20, 6, 8]}>
        <sphereGeometry args={[1, 24, 16]} />
        {std(C.hillFar)}
      </mesh>
      <mesh position={[-1, -1.6, -14]} scale={[13, 3.6, 6]}>
        <sphereGeometry args={[1, 24, 16]} />
        {std(C.hillGreen)}
      </mesh>
      {/* clouds */}
      <group ref={clouds}>
        <Cloud x={-8} y={6.4} z={-12} s={1.7} />
        <Cloud x={-1} y={7.6} z={-14} s={2.2} />
        <Cloud x={7.5} y={6.8} z={-12} s={1.5} />
        <Cloud x={13} y={7.8} z={-15} s={2.4} />
      </group>
      {/* trees around the property */}
      <Tree x={-6.8} z={-2.4} s={1.7} />
      <Tree x={-8.4} z={1.6} s={1.15} />
      <Tree x={7.2} z={-2.2} s={2} />
      <Tree x={6.4} z={3.2} s={1.3} />
      {/* picket fence with a gap for the path */}
      <FenceRun from={-8.4} to={-1.7} z={4.7} />
      <FenceRun from={1.7} to={8.4} z={4.7} />
    </group>
  );
}

/* ----------------------------- knock ripples ------------------------------ */

function Knock({ rig }: { rig: StoryRig }) {
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const apply = (m: THREE.Mesh | null, k: number) => {
      if (!m) return;
      const on = k > 0.001 && k < 0.999;
      m.visible = on;
      if (!on) return;
      const s = 0.35 + k * 1.15;
      m.scale.set(s, s, s);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7;
    };
    apply(r1.current, rig.knock);
    apply(r2.current, Math.max(0, rig.knock - 0.28) / 0.72);
  });
  return (
    <group position={[0.35, 1.35, 0.12]}>
      {[r1, r2].map((r, i) => (
        <mesh key={i} ref={r} visible={false}>
          <torusGeometry args={[0.3, 0.014, 10, 40]} />
          <meshBasicMaterial color="#31508f" transparent opacity={0} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------- model load boundary --------------------------- */

/* Suspends while the character GLB loads and degrades to `fallback` if it
   cannot be loaded at all (missing file, bad parse). Kept in this file because
   it only exists to guard the two <StoryHuman> children. */
class ModelBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.warn('[story] character model unavailable, using stylised figures:', err);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>;
  }
}

/* --------------------------------- scene ---------------------------------- */

export default function StoryScene3D({ rig }: { rig: StoryRig }) {
  return (
    <Canvas
      className="ep-story-canvas"
      shadows="soft"
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [rig.cam.x, rig.cam.y, rig.cam.z], fov: rig.cam.fov, near: 0.1, far: 60 }}
      onCreated={(state: RootState) => {
        if (process.env.NODE_ENV !== 'production') {
          // lets you step a single frame while tuning beat timings
          (window as unknown as Record<string, unknown>).__storyRender = () =>
            state.advance(performance.now());
        }
      }}
    >
      <fog attach="fog" args={['#e8eefb', 14, 34]} />
      <CameraRig rig={rig} />
      <Lights rig={rig} />
      <Environment3D />
      <House rig={rig} />
      {/* Rigged humans when a character GLB is present. If the file is absent
          or fails to parse, this falls back to the stylised figures — which
          also match the clay art direction, so shipping without a model is a
          legitimate choice, not a broken state. */}
      <ModelBoundary fallback={<><Person rig={rig} who={1} /><Person rig={rig} who={2} /></>}>
        <StoryHuman rig={rig} who={1} />
        <StoryHuman rig={rig} who={2} />
      </ModelBoundary>
      <Knock rig={rig} />
      {/* soft constant fill so the navy door reads in every beat */}
      <pointLight position={[0.4, 1.5, 2.4]} intensity={0.35} color="#fff1dd" distance={5.5} decay={1.6} />
      {/* lawn + ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 1.5]} receiveShadow>
        <circleGeometry args={[18, 48]} />
        {std(C.ground, { roughness: 1 })}
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.4, -0.005, 1.2]} receiveShadow>
        <circleGeometry args={[7.5, 40]} />
        {std(C.lawn, { roughness: 1 })}
      </mesh>
    </Canvas>
  );
}
