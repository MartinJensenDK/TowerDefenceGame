# Model contract (Blender → Troll Towers)

All 14 models exist in `blender/troll-towers.blend` (one collection per model) and are exported to `client/public/models/`. Drop new `.glb` files into `client/public/models/` to replace them. The game loads them at start; anything missing falls back to a built-in placeholder, so you can replace models one at a time.

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
| `decor_tree.glb`, `decor_rock.glb`, `decor_cactus.glb`, `decor_reed.glb` | Decoration | fits inside 2×2 m |
| `base_castle.glb` | The castle the trolls attack; fills 3×3 tiles | ≤ 6 m (3×3 tiles); shipped model ~5.6 m wide, ~6 m tall, gate on +Z |
| `spawn_gate.glb` | Where trolls come out; spans 3 tiles across the road | ≤ 6 m wide (shipped ~5.9 m), ~4 m tall, 1 tile deep, opening faces +Z |

## Scale and origin
- 1 Blender unit = 1 metre. One grid tile is **2 × 2 m**.
- Origin at the **bottom centre** of the model (it is placed exactly on the tile centre at ground level).
- Models face **+Z** ("forward"). Turrets and gates are rotated by the game around Y.

## Named parts (optional, but recommended for towers)
- `Turret` – a child object that rotates toward the target (crossbow, cannon). If missing, the whole model rotates.
- `Muzzle` – an Empty inside `Turret` where projectiles start. If missing, projectiles start 1.2 m above the turret origin.
- `Spike` – any number of meshes named `Spike`, `Spike.001`, `Spike.002`, … (Blender numbering is fine; the loader strips the dot, which the game also accepts) rise 0.45 m when the spike tower ticks.
- `WingL` / `WingR` – flap on flying trolls.
- `Operator` – the little troll on the tower (purely cosmetic).
- `Flag` – on the castle: a subdivided plane whose pole edge is at local x = 0 and whose cloth extends along +X. The game waves it in the wind by displacing vertices, so the more subdivisions the smoother (16×8 is used).
- `Princess` – the princess troll on the castle balcony (purely cosmetic).

## Animations (optional)
Clips named `idle`, `shoot`, `walk`, `die` are picked up if present. Without them the game uses its own squash-and-stretch.

## Materials
Principled BSDF base colours or vertex colours. Keep textures small (≤ 1024 px). The game replaces materials with a toon shader that keeps the base colour and texture, so avoid relying on roughness/metalness.

## Checking a model
Run `npm run dev`, open the game; the console prints `[models] <name>: using placeholder` for every missing file. A loaded model prints nothing.
