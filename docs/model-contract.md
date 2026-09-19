# Model contract (Blender → Troll Towers)

All 21 models exist in `blender/troll-towers.blend` (one collection per model) and are exported to `client/public/models/`. Drop new `.glb` files into `client/public/models/` to replace them. The game loads them at start; anything missing falls back to a built-in placeholder, so you can replace models one at a time.

## Export settings (Blender → File → Export → glTF 2.0)
- Format: **glTF Binary (.glb)**
- Include: Selected Objects (or the whole collection for that model)
- Transform: **+Y Up** (default)
- Mesh: Apply Modifiers ✔, UVs ✔, Normals ✔, Vertex Colors ✔ (if used)
- Animation: ✔ if the model has clips (see below)

## File names
| File | What it is | Size guide |
|---|---|---|
| `tower_crossbow.glb` | Crossbow tower | ~1.6 m wide, 2–3 m tall |
| `tower_spike.glb` | Spike tower | ~1.8 m wide, 0.5–1 m tall (spikes rise out of it) |
| `tower_cannon.glb` | Cannon tower | ~1.6 m wide, 2–3 m tall |
| `tower_frozen.glb` | Frozen ice block | ~1.4 m cube |
| `troll_scout.glb` | Scout troll | ~1 m tall |
| `troll_brute.glb` | Brute troll | ~1.8 m tall |
| `troll_bat.glb` | Bat troll (flying) | ~0.8 m, hovering ~1.2 m above ground |
| `troll_boss.glb` | Boss troll | ~3 m tall |
| `troll_archer.glb` | Archer troll (hood, longbow, quiver; never shoots) | ~1.1 m tall |
| `troll_knight.glb` | Armoured troll (plate, sword, kite shield) | ~1.5 m tall |
| `troll_wolfrider.glb` | Small troll riding a wolf | ~1.8 m tall, ~2 m long |
| `troll_eaglerider.glb` | Small troll on an eagle (flying) | ~2.6 m to the top, hovering ~1.1 m above ground, ~2.8 m wingspan |
| `troll_rhino.glb` | Boss: big troll in full iron on an armoured rhino, flaming sword | ~3.6 m tall, ~3.2 m long |
| `troll_wolfpack.glb` | Boss: big troll dragging a huge club, three leashed wolves in front | ~2.8 m tall, ~3.5 m wide |
| `troll_giant.glb` | Final boss: the Troll King in royal plate with a tower shield and a glowing sword | ~5.5 m tall |
| `decor_tree.glb`, `decor_rock.glb`, `decor_cactus.glb`, `decor_reed.glb` | Decoration | fits inside 2×2 m |
| `decor_mountain.glb` | Mountain ridge on the north edge of Vast Meadows; listed in the map's `props` with its tile footprint and stretched to it | 60 × 12 m (30 × 6 tiles), ~17 m high, origin bottom centre |
| `base_castle.glb` | The castle the trolls attack; fills 3×3 tiles | ≤ 6 m (3×3 tiles); shipped model ~5.6 m wide, ~6 m tall, gate on +Z |
| `spawn_gate.glb` | Where trolls come out; spans 3 tiles across the road | ≤ 6 m wide (shipped ~5.9 m), ~4 m tall, 1 tile deep, opening faces +Z |

## Scale and origin
- 1 Blender unit = 1 metre. One grid tile is **2 × 2 m**.
- Origin at the **bottom centre** of the model (it is placed exactly on the tile centre at ground level).
- Models face **+Z** ("forward"). Turrets and gates are rotated by the game around Y.

## Textures
Image textures on the Base Color input are exported inside the `.glb` and the game keeps them (it swaps the material for a toon material but copies the `map`). The castle and spawn gate use small procedural brick and shingle images generated in Blender (`tt_helpers`: `make_texture`, `tex_mat`, `box_uv`, `cyl_uv`); keep textures at 256×256 or smaller and set interpolation to *Closest* for the cartoon look. Towers reuse the castle's `CastleStoneTex` (same 1.2 m brick repeat) on stone and the `PlankTex` planks on wood, plus the castle's `FlagBlue`, `Gold` and `Moss` materials, so tower details match the buildings.

## Named parts (optional, but recommended for towers)
- `Turret` – a child object that rotates toward the target (crossbow, cannon). If missing, the whole model rotates.
- `Muzzle` – an Empty inside `Turret` where projectiles start. If missing, projectiles start 1.2 m above the turret origin.
- `Spike` – any number of meshes named `Spike`, `Spike.001`, `Spike.002`, … (Blender numbering is fine; the loader strips the dot, which the game also accepts) rise 0.45 m when the spike tower ticks.
- `LegL` / `LegR` / `ArmL` / `ArmR` – Empties at the hips and shoulders of a troll with the leg/arm parts (and the weapon) parented under them. The game swings them about X while the troll runs; without them it falls back to squash-and-stretch. A mount (wolf, rhino) has two pairs: `LegL`/`LegR` in front and `LegL.001`/`LegR.001` behind (the loader turns that into `LegL001`); the game moves every odd-numbered pair the opposite way, so quadrupeds trot on diagonal legs. The wolf pack simply keeps numbering (`LegL.002`…). A rider's arms are the model's `ArmL`/`ArmR`; its legs are plain meshes hanging down the mount's flanks. `tt_enemies.export_coll_named` renumbers these names in creation order (`tt_order` custom property) on export.
- Walk cadence – `cadence` in `enemies.json` (walk cycles per second at full speed, default 9) sets how fast the limbs swing; the Troll King's 2.2 gives him slow, heavy steps, riders get 12.
- Glow – materials whose name contains `Glow`, `Flame` or `Fire` (`BlueGlow`, `BlueGlowHalo`, `FlameGlow`, `FlameGlowTip`) keep their Blender emission in the game and pulse (flaming sword, the Troll King's blade). Set *Emission Color* + *Emission Strength* on the Principled BSDF; `tt_enemies.glow_mat` does it.
- `WingL` / `WingR` – flap on flying trolls.
- `Operator` – the little troll on the tower (purely cosmetic). The game plays idle antics between shots on its children: `Operator_ArmL` / `Operator_ArmR` are Empties at the shoulders with the arm, hand and fingers parented under them (swung for nose picking, belly grabbing, waving, dancing, scratching), `Operator_Head` is turned and tilted, `Operator_Pupil` moved to cross the eyes. Missing parts are simply skipped.
- `Flag` – on the castle and on every tower: a subdivided plane whose pole edge is at local x = 0 and whose cloth extends along +X. The game waves it in the wind by displacing vertices (`render/FlagWave.js`), so the more subdivisions the smoother (16×8 is used). One `Flag` per model; small flags ripple faster and less far than the castle banner.
- Level colour – instead of level stars the game paints the tower's `Flag` and its weapon parts in the level colour (`data/levelColors.js`): crossbow `Limb*` / `LimbCap*` / `Fletch*`, spike `Spike*`, cannon `Barrel` / `Breech` / `Cascabel`, frozen `Operator_Bucket`. Keep those parts untextured (plain Base Color) so the tint reads cleanly.
- `Archer`, `Archer.001`, … – on the castle: archer trolls on the wall tops (Empties with their parts and a small crossbow parented under them). The game hides them all and shows the first N when the Wall Archers upgrade is at a level with N archers; arrows leave from 0.55 m above each visible archer in turn.
- `Operator_Bucket*` (frozen tower) – the bucket hangs under `Operator_ArmR` so it swings with the throw; the game spawns the water from the first `Operator_Hand` under that arm.
- `Princess` – the princess troll on the castle balcony (purely cosmetic).

## Building the wave 11–50 trolls
The `tt_enemies` text block in the .blend holds `troll_body` (armour/weapon kinds), `wolf`, `eagle`, `rhino` and one `build_<type>()` per model; run `exec(bpy.data.texts['tt_helpers'].as_string()); exec(bpy.data.texts['tt_enemies'].as_string()); build_giant()` in Blender's Python console and export the collection with `export_coll_named('troll_giant', path)`.

## Animations (optional)
Clips named `idle`, `shoot`, `walk`, `die` are picked up if present. Without them the game uses its own squash-and-stretch.

## Materials
Principled BSDF base colours or vertex colours. Keep textures small (≤ 1024 px). The game replaces materials with a toon shader that keeps the base colour and texture, so avoid relying on roughness/metalness.

## Checking a model
Run `npm run dev`, open the game; the console prints `[models] <name>: using placeholder` for every missing file. A loaded model prints nothing.
