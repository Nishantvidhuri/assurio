# Story scene character models

The homepage story scene loads a rigged humanoid GLB and animates it from the
scroll timeline (`app/components/StoryHuman.tsx`).

**The model is optional.** If no GLB is present — or it fails to parse — the
scene falls back to stylised primitive figures and keeps working. Those
figures arguably suit the clay-render art direction better than a
photoreal human would, so shipping without a character model is a legitimate
choice, not a broken state.

## ⚠️ `_dev-placeholder-human.glb` must not ship

That file is `Xbot.glb` from the [three.js](https://github.com/mrdoob/three.js)
examples: a grey **mannequin** with no clothing or skin tone. The scene paints
a costume onto it with vertex colours so it reads as clothed, but it will never
look like a real person — the underlying mesh is a robot dummy.

It is also a Mixamo-derived asset, and Adobe's terms do not permit
redistributing the character itself. **Delete it before production.**

## Getting a real character

Any standard humanoid rig drops in. Ranked by how well they fit this project:

| Source | Cost | Notes |
|---|---|---|
| **Sketchfab** | Free acct | Direct `.glb` download. Filter: Downloadable + Rigged + CC licence. The only easy source with genuine **South Asian** characters — worth it for an India-facing page. |
| **Mixamo** (Adobe) | Free acct | ~100 clothed characters **plus `Walk`/`Idle` clips**. Rig is literally Mixamo naming, so this code binds with zero changes. Exports FBX — convert to GLB in Blender. Characters skew generic/Western. |
| **Commission / stock** | ₹2–5k | TurboSquid, CGTrader, or a freelancer. For a production marketing page this is usually the best ROI: you get two correct characters, clear commercial licence, and no representation mismatch. |
| **AI generation** | Free–paid | Meshy, Tripo, Rodin: image or text → rigged character. Fast, quality improving; check the licence on the tier you use. |
| **Avaturn** | Free tier | Realistic avatar generator with GLB export and a Mixamo-compatible rig. |
| **Blender + MakeHuman** | Free | Full control, needs 3D skill. |

Avoid `CesiumMan` from the Khronos samples — it *looks* more human but has only
19 bones, no animation clips, and non-standard names (`leg_joint_L_1`, no
`Head`/`Hand`), so the cap, hood, toolbox, folder and knock all stop working.

## Installing your models

1. Save them as `worker.glb` and `applicant.glb` in this folder.
2. In `app/components/StoryHuman.tsx`, make the path per-character:

   ```ts
   const MODEL_URL = who === 1 ? '/models/worker.glb' : '/models/applicant.glb';
   ```

3. Delete `_dev-placeholder-human.glb`.

Keep each file **under ~2 MB**. Two 8 MB avatars will hurt conversion badly on
the mid-tier Android common in this market. If your export is heavy, decimate
in Blender, cap textures at 512², and drop morph targets — the story never
shows facial expressions.

## How the binding works

- **Bones** resolve through a fallback chain: `mixarig<Name>`, `mixamorig:<Name>`,
  bare `<Name>`, then a case-insensitive suffix match. Note that GLTFLoader
  strips colons, so a rig authored as `mixamorig:Hips` arrives as
  `mixamorigHips` — the chain covers both.
- **Scale** is normalised to `TARGET_HEIGHT` (1.72 scene units) measured from
  the **skeleton**, not the meshes. `Box3.setFromObject()` is unreliable on a
  `SkinnedMesh` (it folds in bone matrices and can report a height 100× off),
  so donor models of any unit scale seat correctly on the ground.
- **Animation** clips are matched fuzzily (`walk`, then `idle`/`breath`/`stand`).
  With no clips the figure still walks into place, turns, knocks and fades — it
  just has no leg-swing cycle. Walk time is driven by distance travelled, not
  wall clock, so the stride stays locked to scroll and reverses correctly.
- **Textured vs bare**: a model with a texture map keeps its own colours; only
  an untextured mannequin gets the vertex-colour costume. Both darken to a
  silhouette for the reveal.
- If feet appear to slide, tune `STRIDE` — scene units per full walk cycle.
