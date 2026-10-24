shader_type canvas_item;
// One MultiMesh draws many sprites of one atlas: each instance carries its atlas frame as a UV rectangle
// (u0, v0, du, dv) in INSTANCE_CUSTOM; the instance colour (alpha) modulates it.

void vertex() {
	UV = INSTANCE_CUSTOM.xy + UV * INSTANCE_CUSTOM.zw;
}

void fragment() {
	COLOR *= texture(TEXTURE, UV);
}
