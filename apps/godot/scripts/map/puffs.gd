class_name Puffs
extends RefCounted
## Rising puffs of smoke or dust drawn into any canvas item (apps/client scene/world/ambient-layer.ts): a few puffs per source,
## each rising, swelling and fading over PUFF_S seconds, offset by the source's seed so neighbours never pulse together.
## Display time only, never game time: it is decoration.

const PUFF_S := 3.2
const SMOKE := Color("8f877d")
const DUST := Color("c8b28a")
## Thicker smoke, from something burning.
const BURNING := Color("5e554c")

## `at`: the source in the canvas's coordinates; `k`: world px per screen px wanted (puffs keep their screen size);
## `strength` 0..1 scales the opacity; `rise` is how high a puff climbs in world px at k = 1.
static func draw(canvas: CanvasItem, at: Vector2, t_s: float, k: float, seed: float, count: int, color: Color, strength := 1.0, rise := 86.0, drift := 18.0, puff := 1.0) -> void:
	for i in count:
		var phase := fposmod(t_s / PUFF_S + float(i) / count + seed, 1.0)
		var r := (7.0 + phase * 16.0) * k * puff
		var a := 0.75 * (1.0 - phase) * minf(1.0, phase * 6.0) * strength
		var p := at + Vector2(sin(phase * 4.0 + i + seed * 6.0) * 7.0 * k + phase * drift * k, -phase * rise * k)
		canvas.draw_circle(p, r, Color(color, a))
