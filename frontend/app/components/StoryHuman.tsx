'use client';

/* ============================================================================
   StoryHuman — a real rigged human for the home-page story.

   Loads a standard humanoid GLB (Mixamo / Ready Player Me bone naming) and
   drives it from the shared StoryRig:

   - walk cycle time is a function of the character's X position, not wall
     clock, so the stride stays locked to the scroll and reverses correctly
     when the user scrolls back up
   - idle breathing runs on real time so the figure never looks frozen
   - the knock is an additive arm raise layered on top of the baked clip
   - the disguise drop retints the whole mesh and swaps cap -> hood

   Swapping models: drop your own GLB at the path in MODEL_URL. Any rig using
   Mixamo or Ready Player Me bone names works with no code changes — the mesh
   is auto-scaled to TARGET_HEIGHT so proportions stay correct.
   ========================================================================== */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { StoryRig } from './storyRig';

/* Replace with your own Ready Player Me export — see public/models/README.md */
const MODEL_URL = '/models/_dev-placeholder-human.glb';

/** World height in scene units the model is normalised to (door is 2.25 tall). */
const TARGET_HEIGHT = 1.72;
/** Scene units travelled per full walk-clip cycle. Lower = faster leg turnover. */
const STRIDE = 1.45;

const PALETTE = {
  hood: '#23262e',
  cap: '#4a6fa5',
  toolbox: '#a3502e',
  folder: '#31508f',
  satchel: '#8a6a4f',
} as const;

/* Costumes painted onto an untextured (mannequin) model as vertex colours.
   A textured character carries its own skin and clothing, so this is skipped
   for those — see `textured` in the material setup below. */
const COSTUME = {
  1: { skin: '#c68642', shirt: '#dcd6c8', trousers: '#3f4a63', shoes: '#2e2a26', hair: '#2b2018' },
  2: { skin: '#a9683f', shirt: '#4f9e8c', trousers: '#37506e', shoes: '#2e2a26', hair: '#1e1712' },
} as const;

/* Paint skin / shirt / trousers / shoes regions onto a bare mannequin.

   Works off bind-pose vertex height plus lateral distance, so it needs no UV
   knowledge: the head and forearms become skin, the torso and upper arms a
   shirt, the legs trousers, the feet shoes. */
function paintCostume(geo: THREE.BufferGeometry, c: (typeof COSTUME)[1 | 2]) {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const minY = bb.min.y;
  const H = Math.max(bb.max.y - minY, 1e-6);
  const maxAbsX = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), 1e-6);

  const skin = new THREE.Color(c.skin);
  const shirt = new THREE.Color(c.shirt);
  const trousers = new THREE.Color(c.trousers);
  const shoes = new THREE.Color(c.shoes);
  const hair = new THREE.Color(c.hair);

  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / H;      // 0 = feet, 1 = crown
    const ax = Math.abs(pos.getX(i)) / maxAbsX; // 0 = centre line, 1 = fingertip

    let col: THREE.Color;
    if (t > 0.95) col = hair;                 // crown
    else if (t > 0.845) col = skin;           // face + neck
    else if (ax > 0.58 && t > 0.52) col = skin; // forearms + hands
    else if (t > 0.5) col = shirt;            // torso + upper arms
    else if (t > 0.055) col = trousers;       // hips + legs
    else col = shoes;                         // feet

    out[i * 3] = col.r;
    out[i * 3 + 1] = col.g;
    out[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
}

/* Resolve a bone across naming conventions. Note GLTFLoader sanitises names,
   so a rig authored as "mixamorig:Hips" arrives as "mixamorigHips". */
function findBone(root: THREE.Object3D, name: string): THREE.Bone | null {
  const candidates = [
    `mixamorig${name}`,
    `mixamorig:${name}`,
    `mixamorig1${name}`,
    `mixamorig1:${name}`,
    name,
  ];
  for (const c of candidates) {
    const hit = root.getObjectByName(c);
    if (hit) return hit as THREE.Bone;
  }
  // last resort: case-insensitive suffix match anywhere in the hierarchy
  let found: THREE.Bone | null = null;
  const want = name.toLowerCase();
  root.traverse((o) => {
    if (found || !(o as THREE.Bone).isBone) return;
    if (o.name.toLowerCase().endsWith(want)) found = o as THREE.Bone;
  });
  return found;
}

/* Bind-pose bounds in the model's local space, measured from the SKELETON.

   Measuring the meshes is wrong for a rigged character: a SkinnedMesh is drawn
   from its bone matrices, not from its own matrixWorld, so a mesh node
   carrying an armature scale (0.01 is common in Mixamo exports) reports a
   height ~100x off and any normalisation built on it overshoots badly.
   The bones are what actually place the vertices, so measure those.
   Falls back to mesh geometry for unrigged models. */
function measureBindPose(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let bones = 0;

  model.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    bones++;
    box.expandByPoint(o.getWorldPosition(v).applyMatrix4(inv));
  });
  if (bones > 0) {
    // the skull extends above the topmost bone; pad so the crown isn't clipped
    box.max.y += (box.max.y - box.min.y) * 0.06;
    return box;
  }

  const scratch = new THREE.Matrix4();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    if (!b) return;
    box.union(b.clone().applyMatrix4(scratch.multiplyMatrices(inv, mesh.matrixWorld)));
  });
  return box;
}

/* Pick a clip by fuzzy name so differently-labelled exports still work. */
function findClip(clips: THREE.AnimationClip[], ...wants: string[]) {
  for (const w of wants) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(w));
    if (hit) return hit;
  }
  return null;
}

export default function StoryHuman({
  rig,
  who,
}: {
  rig: StoryRig;
  who: 1 | 2;
}) {
  const { scene: gltfScene, animations } = useGLTF(MODEL_URL);
  const group = useRef<THREE.Group>(null);
  const lastX = useRef(-99);

  /* ---- per-instance clone (own skeleton AND own materials) ---- */
  const { model, mixer, walk, idle, bones, mats } = useMemo(() => {
    const model = skeletonClone(gltfScene) as THREE.Group;

    // normalise height so any donor model lands at human scale in this scene
    const box = measureBindPose(model);
    const h = box.max.y - box.min.y;
    const k = h > 1e-4 ? TARGET_HEIGHT / h : 1;
    model.scale.setScalar(k);
    // seat the feet exactly on the ground
    model.position.y = -box.min.y * k;

    const mats: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // skinned bounds are unreliable while posed
      const src = Array.isArray(m.material) ? m.material : [m.material];
      const textured = src.some((s) => !!(s as THREE.MeshStandardMaterial).map);

      // mannequin rigs often ship exposed joint balls as a separate mesh —
      // hiding them drops the robot read considerably
      if (!textured && /joint/i.test(m.name)) {
        m.visible = false;
        return;
      }

      // bare mannequin: give it its own geometry and paint a costume on
      if (!textured) {
        m.geometry = m.geometry.clone();
        paintCostume(m.geometry, COSTUME[who]);
      }

      const cloned = src.map((s) => {
        const c = (s as THREE.MeshStandardMaterial).clone();
        c.transparent = true;
        c.opacity = 0;
        c.metalness = 0;
        // A textured model already carries its own skin and clothing colour —
        // tinting it would paint over that, so leave .color at white and only
        // use it to darken into silhouette for the reveal.
        c.userData.textured = textured;
        if (!textured) {
          c.roughness = 0.82;
          c.vertexColors = true; // show the painted costume
          c.needsUpdate = true;
        }
        mats.push(c);
        return c;
      });
      m.material = Array.isArray(m.material) ? cloned : cloned[0];
    });

    const mixer = new THREE.AnimationMixer(model);
    const walkClip = findClip(animations, 'walk');
    const idleClip = findClip(animations, 'idle', 'breath', 'stand');
    const walk = walkClip ? mixer.clipAction(walkClip) : null;
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    for (const a of [walk, idle]) {
      if (!a) continue;
      a.play();
      a.setEffectiveWeight(0);
      a.setLoop(THREE.LoopRepeat, Infinity);
    }

    const bones = {
      rightArm: findBone(model, 'RightArm'),
      rightForeArm: findBone(model, 'RightForeArm'),
      head: findBone(model, 'Head'),
      leftHand: findBone(model, 'LeftHand'),
      rightHand: findBone(model, 'RightHand'),
      spine: findBone(model, 'Spine'),
    };

    return { model, mixer, walk, idle, bones, mats };
  }, [gltfScene, animations, who]);

  /* ---- props + headwear, parented to bones so they follow the rig ---- */
  const props = useMemo(() => {
    const mk = (
      geo: THREE.BufferGeometry,
      color: string,
    ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> => {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      return mesh;
    };

    /* Geometry is authored in WORLD units; the attach step below rescales each
       prop into its bone's local units, which differ from world by the
       armature scale. `offset` is likewise in world units. */
    const cap = mk(new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), PALETTE.cap);
    cap.scale.y = 0.62;

    const peak = mk(new THREE.CylinderGeometry(0.11, 0.11, 0.018, 18, 1, false, -Math.PI / 2, Math.PI), PALETTE.cap);
    peak.rotation.x = -0.12;

    const hood = mk(new THREE.SphereGeometry(0.145, 22, 16, Math.PI * 0.6, Math.PI * 1.8, 0, Math.PI * 0.74), PALETTE.hood);
    hood.material.side = THREE.DoubleSide;

    const toolbox = mk(new THREE.BoxGeometry(0.3, 0.19, 0.14), PALETTE.toolbox);
    const folder = mk(new THREE.BoxGeometry(0.34, 0.26, 0.04), PALETTE.folder);
    const satchel = mk(new THREE.BoxGeometry(0.24, 0.28, 0.11), PALETTE.satchel);

    return { cap, peak, hood, toolbox, folder, satchel };
  }, []);

  useEffect(() => {
    const { head, leftHand, rightHand } = bones;
    model.updateMatrixWorld(true);
    const ws = new THREE.Vector3();

    /* Bones sit inside the armature's own scale, so a prop authored in world
       units must be divided by the bone's world scale to come out the right
       size on screen. offset is in world units for the same reason. */
    const attach = (
      bone: THREE.Bone | null,
      mesh: THREE.Mesh,
      offset: [number, number, number],
    ) => {
      if (!bone) return;
      bone.add(mesh);
      bone.getWorldScale(ws);
      const inv = 1 / (ws.x || 1);
      mesh.scale.multiplyScalar(inv);
      mesh.position.set(offset[0] * inv, offset[1] * inv, offset[2] * inv);
    };

    if (who === 1) {
      attach(head, props.cap, [0, 0.075, 0.005]);
      attach(head, props.peak, [0, 0.055, 0.085]);
      attach(head, props.hood, [0, 0.035, -0.02]);
      attach(rightHand, props.toolbox, [0, -0.14, 0.02]);
      attach(leftHand, props.folder, [0, -0.1, 0.03]);
    } else {
      attach(rightHand, props.satchel, [0, -0.15, 0.02]);
      attach(leftHand, props.folder, [0, -0.1, 0.03]);
    }

    return () => {
      for (const m of Object.values(props)) {
        m.removeFromParent();
        m.geometry.dispose();
        m.material.dispose();
      }
    };
  }, [bones, props, who, model]);

  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);


  /* ---- per-frame: pose from the scroll rig ---- */
  const cHood = useMemo(() => new THREE.Color(PALETTE.hood), []);
  const cWhite = useMemo(() => new THREE.Color('#ffffff'), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;

    const x = who === 1 ? rig.v1x : rig.v2x;
    const o = who === 1 ? rig.v1o : rig.v2o;
    const mask = who === 1 ? rig.mask : 0;

    g.visible = o > 0.01;
    if (!g.visible) return;

    const moved = Math.abs(x - lastX.current);
    const walking = moved > 0.0006 && lastX.current !== -99;
    lastX.current = x;

    /* stride locked to distance travelled — scrubs cleanly in both directions */
    if (walk) {
      const dur = walk.getClip().duration;
      walk.time = ((((-x) / STRIDE) * dur) % dur + dur) % dur;
      walk.setEffectiveWeight(walking ? 1 : 0);
    }
    if (idle) {
      idle.time = clock.elapsedTime % idle.getClip().duration;
      idle.setEffectiveWeight(walking ? 0 : 1);
    }
    mixer.update(0); // evaluate at the times we just set, don't advance

    /* knock: additive arm raise, applied after the clip has written bones */
    const k = Math.sin(Math.min(Math.max(rig.knock, 0), 1) * Math.PI);
    if (k > 0.001) {
      bones.rightArm?.rotateZ(-1.15 * k);
      bones.rightForeArm?.rotateZ(-0.75 * k);
    }

    /* placement + facing */
    g.position.set(x, 0, 1.05);
    const settle = THREE.MathUtils.clamp(1 - Math.abs(-1.3 - x) / 2.4, 0, 1);
    g.rotation.y = THREE.MathUtils.lerp(Math.PI / 2, Math.PI * 0.86, settle);

    /* fades + the disguise draining to charcoal.
       Costume colour lives in the texture or the painted vertex colours, so
       .color stays white and is only used to darken into silhouette. */
    tmp.lerpColors(cWhite, cHood, mask);
    for (const m of mats) {
      m.opacity = o;
      m.color.copy(tmp);
    }
    props.folder.material.opacity = o * (1 - mask);
    props.toolbox.material.opacity = o * (1 - mask);
    props.satchel.material.opacity = o;
    props.cap.material.opacity = o * (1 - mask);
    props.peak.material.opacity = o * (1 - mask);
    props.hood.material.opacity = o * mask;
  });

  return (
    <group ref={group} visible={false}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
