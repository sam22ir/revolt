class_name GroundLayer
extends Node2D
## The ground: the inked surface (GroundSurface) and the frontier's raked strip round it (GroundFrame). Props, region seams and
## objects are separate layers above (see WorldMap).

var _surface := GroundSurface.new()
var _frame := GroundFrame.new()

func _ready() -> void:
	add_child(_surface)
	add_child(_frame)

## `land` and `features` are GroundField's pictures of the map.
func build(size: int, land: Image, features: Image) -> void:
	_surface.setup(size, land, features)
	_frame.setup(size)

## The regions and which are liberated, drawn in the ground.
func set_regions(size: int, regions: PackedInt32Array, liberated: Dictionary) -> void:
	_surface.set_regions(size, regions, liberated)

func set_view_zoom(_view_zoom: float) -> void:
	pass

func set_part_visible(_part: String, _visible_now: bool) -> void:
	pass
