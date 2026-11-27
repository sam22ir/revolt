extends SceneTree
## The camp as the game draws it today (BaseView, 2D pictures), for comparing with tools/camp3d_shot.gd. Needs a display:
##   godot --path . -s tools/camp2d_shot.gd -- <out.png> [zoom 1 to CampLayout.MAX_ZOOM] [world x,y to zoom about] [w] [h] [state] [lang] [tap world x,y]
## `state` is one of STATES (camp life, docs/camp-life-plan.md); with `tap`, whoever is there says their line in `lang`.
## In `ar` the name plates come out shifted (the tool sets the locale but not the layout direction the game sets); the game is fine.
## Prints the painting px at the middle of the picture (to centre the 3D shot on), saves it, then times 120 frames.

const LEVELS := {"hq": 1, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1}
const NOW := 1_793_800_000_000
## Made-up game states for looking at camp life: [levels, queue, state, amounts as a share of each cap].
const STATES := {
	"quiet": [LEVELS, null, {}, {"food": 0.5, "materiel": 0.5, "funds": 0.5, "support": 0.0}],
	"busy": [
		{"hq": 8, "farm": 1, "armory": 1, "treasury": 1, "barracks": 1, "hero_hall": 1},
		{"building": "farm", "toLevel": 2, "startedAt": NOW - 60000, "endsAt": NOW + 600000},
		{"training": {"troop": "infantry", "count": 20, "startedAt": NOW, "endsAt": NOW + 60000}, "wounded": {"infantry": 25},
			"marches": [{"departAt": NOW - 12000, "arriveAt": NOW + 600000, "returnAt": NOW + 1200000},
				{"departAt": NOW - 1200000, "arriveAt": NOW - 600000, "returnAt": NOW + 16000}]},
		{"food": 1.0, "materiel": 0.95, "funds": 1.0, "support": 1.0},
	],
	"lowfood": [LEVELS, null, {}, {"food": 0.05, "materiel": 0.5, "funds": 0.5, "support": 0.3}],
}

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out := args[0]
	var zoom := float(args[1]) if args.size() > 1 else 1.0
	var size := Vector2i(int(args[3]) if args.size() > 3 else 720, int(args[4]) if args.size() > 4 else 1290)
	root.size = size
	var view := SubViewport.new()
	view.size = size
	view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(view)
	var layer := CanvasLayer.new()
	view.add_child(layer)
	var base := BaseView.new()
	base.layer = layer
	layer.add_child(base)
	var preset: Array = STATES[args[5] if args.size() > 5 else "quiet"]
	if args.size() > 6:
		TranslationServer.set_locale(args[6])
	var levels: Dictionary = preset[0]
	var caps := Balance.storage_cap(int(levels["hq"]))
	var amounts := {}
	for id: String in preset[3]:
		amounts[id] = float(caps[id]) * float(preset[3][id])
	var summary := CampSummary.build(levels, preset[1], preset[2], amounts)
	base.build()
	base.apply_fit(Vector2(size), 0.0, 0.0)
	base.set_state(levels, preset[1], NOW, summary)
	if args.size() > 7:
		var tap := args[7].split(",")
		print("TALK %s: %s" % [base.talk_at(Vector2(float(tap[0]), float(tap[1]))), base.talk_text()])
	if zoom > 1.0:
		var about := Vector2(size) / 2.0
		if args.size() > 2 and args[2] != "-":
			var xy := args[2].split(",")
			about = layer.offset + Vector2(float(xy[0]), float(xy[1])) * layer.scale
		base.zoom_about(zoom, about)
	var middle := (Vector2(size) / 2.0 - layer.offset) / layer.scale * 2.0
	print("MIDDLE painting px %d,%d" % [roundi(middle.x), roundi(middle.y)])
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	view.get_texture().get_image().save_png(out)
	print("SAVED %s" % out)
	var total := 0
	var worst := 0
	for i in 120:
		var t := Time.get_ticks_usec()
		base.set_state(levels, preset[1], NOW + i * 16, summary)
		await RenderingServer.frame_post_draw
		var d := Time.get_ticks_usec() - t
		total += d
		worst = maxi(worst, d)
	print("FRAMES avg %.1f ms, worst %.1f ms" % [total / 120000.0, worst / 1000.0])
	quit()
