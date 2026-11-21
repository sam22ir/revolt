extends SceneTree
## Writes tools/blender/silhouettes.json: where each 3D camp building (CampModels) shows on the painting, as triangles in painting
## px, for tools/camp_fill_buildings.py to smudge out of the ground.
##
## Run from apps/godot:  godot --headless -s tools/camp_silhouettes.gd

const OUT := "res://tools/blender/silhouettes.json"

func _init() -> void:
	var out := {}
	for id: String in CampModels.PLACES:
		var points: Array = []
		for p in CampModels.silhouette(id):
			points.append([snappedf(p.x, 0.1), snappedf(p.y, 0.1)])
		out[id] = points
	var file := FileAccess.open(OUT, FileAccess.WRITE)
	file.store_string(JSON.stringify(out))
	file.close()
	quit()
