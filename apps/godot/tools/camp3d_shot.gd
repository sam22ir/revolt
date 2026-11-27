extends SceneTree
## The camp in real 3D, a look test (docs/camp-life-plan.md): the Blender kits exported by tools/blender/camp_export.py, drawn
## with shaders/camp_3d.gdshader and an ink outline, from the camera the 2D pictures are rendered from. Needs a display:
##   godot --path . -s tools/camp3d_shot.gd -- <out.png> [zoom] [painting px x,y to centre] [shadows 0|1] [outline 0|1] [w] [h]
## Saves the picture, then draws 120 more frames and prints the average and worst frame time.

const SIZE := Vector2(1536.0, 2752.0)
const DISTANCE := 4000.0
## Blender's sun (camp_ink.SUN) in Godot's axes.
const SUN := Vector3(0.2, 0.77, 0.6)

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var out := args[0]
	var zoom := float(args[1]) if args.size() > 1 else 1.0
	var at := SIZE / 2.0
	if args.size() > 2 and args[2] != "-":
		var xy := args[2].split(",")
		at = Vector2(float(xy[0]), float(xy[1]))
	var shadows := args.size() <= 3 or args[3] == "1"
	var outline := args.size() <= 4 or args[4] == "1"
	var size := Vector2i(int(args[5]) if args.size() > 5 else 720, int(args[6]) if args.size() > 6 else 1290)
	root.size = size
	var view := SubViewport.new()
	view.size = size
	view.own_world_3d = true
	view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(view)
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/camp_3d.gdshader")
	if outline:
		var ink := ShaderMaterial.new()
		ink.shader = load("res://shaders/camp_3d_outline.gdshader")
		mat.next_pass = ink
	var faces := 0
	for file: String in ["ground", "buildings"]:
		var scene: Node = (load("res://art/camp/3d/%s.glb" % file) as PackedScene).instantiate()
		view.add_child(scene)
		for m: Node in scene.find_children("*", "MeshInstance3D", true, false):
			var mesh := (m as MeshInstance3D).mesh
			(m as MeshInstance3D).material_override = mat
			for s in mesh.get_surface_count():
				faces += mesh.surface_get_array_index_len(s) / 3
			if m.name == "hq":
				var colours: PackedColorArray = mesh.surface_get_arrays(0)[Mesh.ARRAY_COLOR]
				print("COLOURS hq: %d, first %s" % [colours.size(), colours[0] if colours.size() > 0 else "none"])
	var sun := DirectionalLight3D.new()
	sun.shadow_enabled = shadows
	sun.directional_shadow_max_distance = 9000.0
	sun.light_energy = 1.0
	view.add_child(sun)
	sun.look_at_from_position(SUN.normalized() * 3000.0, Vector3.ZERO)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("9fb3c4")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.16, 0.15, 0.14)
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	view.add_child(world_env)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.near = 1.0
	camera.far = 20000.0
	# The whole camp's height at zoom 1 (phone shots keep the painting's aspect, like CampLayout.fit).
	camera.size = SIZE.y / zoom
	var basis := Basis.from_euler(Vector3(deg_to_rad(-30.0), deg_to_rad(45.0), 0.0))
	var target := ground_at(basis, at)
	camera.transform = Transform3D(basis, target + basis.z * DISTANCE)
	view.add_child(camera)
	camera.make_current()
	print("FACES %d" % faces)
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	view.get_texture().get_image().save_png(out)
	print("SAVED %s" % out)
	var total := 0
	var worst := 0
	for i in 120:
		var t := Time.get_ticks_usec()
		camera.position += basis.x * 0.5 * (1 if i % 2 == 0 else -1)
		await RenderingServer.frame_post_draw
		var d := Time.get_ticks_usec() - t
		total += d
		worst = maxi(worst, d)
	print("FRAMES avg %.1f ms, worst %.1f ms" % [total / 120000.0, worst / 1000.0])
	quit()

## The point on the flat ground (y 0) that shows at painting px `px` from the rest camera, whose target shows at the centre.
static func ground_at(basis: Basis, px: Vector2) -> Vector3:
	var from := basis.z * DISTANCE + basis.x * (px.x - SIZE.x / 2.0) + basis.y * (SIZE.y / 2.0 - px.y)
	var dir := -basis.z
	return from + dir * (-from.y / dir.y)
