shader_type canvas_item;
render_mode blend_mul;
// The runtime detail overlay (ground-detail.ts): MULTIPLY, repeating every 512 px from the origin. Godot's blend_mul ignores
// alpha, so the zoom fade is done here: at fade 0 the colour is white, which multiplies to no change.
uniform sampler2D detail : filter_linear, repeat_enable;
uniform float fade = 0.0;

varying vec2 world;

void vertex() {
	world = VERTEX;
}

void fragment() {
	vec3 t = texture(detail, fract(world / 512.0)).rgb;
	COLOR = vec4(mix(vec3(1.0), t, fade), 1.0);
}
