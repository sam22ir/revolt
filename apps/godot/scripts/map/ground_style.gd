class_name GroundStyle
extends RefCounted
## The look-test ground variants (docs/godot-visuals-plan.md): a lighter, calmer ground that no longer has to match Phaser. A variant
## is a set of tunable numbers applied on top of the exact Phaser ground plan, so the plan and its golden tests stay untouched:
## the colour field is pulled toward one warm sand with a few large soft tints, the decals are thinned to the light ones, the props
## are fewer, lighter and closer in size, the region borders become a faint light dashed line and the map edge fades out.
## `?ground=a|b|c` picks one on the web; anything else (and every test) is "classic", the unchanged Phaser ground.

const CLASSIC := "classic"
const VARIANTS: Array[String] = ["classic", "a", "b", "c"]

## Mean luminance (0-255) of each decal frame of art/terrain/decals.webp, measured on the opaque pixels. The dark blotches of the
## classic ground are the frames under about 125 (5, 7, 15 and, a little lighter, 1, 10, 14).
const DECAL_LUMA: Array[int] = [171, 116, 142, 137, 151, 74, 126, 83, 176, 133, 122, 185, 140, 173, 119, 88, 132]

## The variant of this run, set once at start-up from the URL (see main.gd); tests leave it classic.
static var active := CLASSIC

const STYLES := {
	# A: the calmest. One sand, faint tints, only the lightest decals, a third of the props, no green wash, no detail overlay.
	"a": {
		"sand": Color("dcc69c"), "ochre": Color("d3ae6e"), "olive": Color("b8b57a"),
		"cell": 26, "ochre_amount": 0.45, "olive_amount": 0.4, "keep": 0.1,
		"decal_min_luma": 150, "decal_alpha": 0.5,
		"prop_keep": 0.33, "prop_alpha": 0.82, "prop_size": 1.12, "prop_spread": 0.7,
		"wash": false, "detail": false,
		"seam": Color(1.0, 0.96, 0.84, 0.5), "seam_width": 2.0, "dash": 14.0,
		"background": Color("c3ab7e"), "fade": 6.0,
	},
	# B: a little more life. Light and mid decals at low alpha, half the props, the detail overlay kept.
	"b": {
		"sand": Color("dcc69c"), "ochre": Color("cfa662"), "olive": Color("aeb06e"),
		"cell": 22, "ochre_amount": 0.6, "olive_amount": 0.55, "keep": 0.18,
		"decal_min_luma": 125, "decal_alpha": 0.6,
		"prop_keep": 0.5, "prop_alpha": 0.9, "prop_size": 1.08, "prop_spread": 0.55,
		"wash": false, "detail": true,
		"seam": Color(1.0, 0.96, 0.84, 0.55), "seam_width": 2.0, "dash": 14.0,
		"background": Color("c3ab7e"), "fade": 6.0,
	},
	# C: warmer and greener. A deeper olive near water, light decals, 40% of the props, the wash kept faint.
	"c": {
		"sand": Color("dfc690"), "ochre": Color("d6a85c"), "olive": Color("a9ae66"),
		"cell": 30, "ochre_amount": 0.55, "olive_amount": 0.75, "keep": 0.12,
		"decal_min_luma": 140, "decal_alpha": 0.45,
		"prop_keep": 0.4, "prop_alpha": 0.85, "prop_size": 1.15, "prop_spread": 0.6,
		"wash": true, "detail": false,
		"seam": Color(1.0, 0.96, 0.84, 0.5), "seam_width": 2.0, "dash": 14.0,
		"background": Color("c3ab7e"), "fade": 6.0,
	},
}

## The variant named by a URL value; anything unknown is classic.
static func parse(value: String) -> String:
	return value if VARIANTS.has(value) else CLASSIC

static func set_active(value: String) -> void:
	active = parse(value)

static func is_classic() -> bool:
	return active == CLASSIC

## The numbers of the active variant ({} for classic).
static func params() -> Dictionary:
	return STYLES.get(active, {})

## The colour field of a variant: one warm sand, an ochre tint and an olive tint that change over many tiles, a little of the
## original terrain colour kept so forest and mountain still read. 0xRRGGBB per tile, like `GroundPlan.build`'s "colours".
static func restyle(colours: PackedInt32Array, size: int, fertility: PackedFloat32Array, v: Dictionary) -> PackedInt32Array:
	var out := PackedInt32Array()
	out.resize(colours.size())
	var sand: Color = v["sand"]
	var ochre: Color = v["ochre"]
	var olive: Color = v["olive"]
	var cell := int(v["cell"])
	for i in colours.size():
		var x := i % size
		var y := i / size
		var n_ochre := GroundPlan._smooth_noise(x, y, cell, 301)
		var n_olive := GroundPlan._smooth_noise(x, y, cell + 9, 302)
		var c := sand.lerp(ochre, smoothstep(0.55, 0.85, n_ochre) * float(v["ochre_amount"]))
		var green := clampf((fertility[i] - 0.5) * 2.0, 0.0, 1.0) * 0.6 + smoothstep(0.6, 0.9, n_olive) * 0.4
		c = c.lerp(olive, green * float(v["olive_amount"]))
		var original := colours[i]
		var orig := Color8((original >> 16) & 0xff, (original >> 8) & 0xff, original & 0xff)
		c = c.lerp(orig, float(v["keep"]))
		out[i] = (c.r8 << 16) | (c.g8 << 8) | c.b8
	return out

## True when a decal frame is light enough for the variant.
static func decal_allowed(frame: int, v: Dictionary) -> bool:
	return frame >= 0 and frame < DECAL_LUMA.size() and DECAL_LUMA[frame] >= int(v["decal_min_luma"])

## True when the prop on a tile stays: a fixed share of the plan's props, chosen by tile so the choice never changes between builds.
static func prop_kept(x: int, y: int, v: Dictionary) -> bool:
	return GroundMath.hash01(x, y, 4242) < float(v["prop_keep"])

## A prop's scale pulled toward one size family: `spread` is how much of the plan's variation remains.
static func prop_scale(plan_scale: float, v: Dictionary) -> float:
	return (1.0 + (plan_scale - 1.0) * float(v["prop_spread"])) * float(v["prop_size"])
