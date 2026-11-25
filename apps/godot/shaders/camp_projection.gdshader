shader_type spatial;
// The camp painting projected onto 3D blocks from the camera it was painted from (`rest_view_projection`), so at rest the
// blocks look exactly like the painting and only show their depth when the camera turns. Unlit: the light is painted in.
render_mode unshaded, cull_disabled;

uniform sampler2D painting : source_color, filter_linear, repeat_disable;
uniform mat4 rest_view_projection;
// Dev only: a red wash to check the blocks against the painting.
uniform float tint = 0.0;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec4 clip = rest_view_projection * vec4(world_pos, 1.0);
	vec2 ndc = clip.xy / clip.w;
	vec3 color = texture(painting, vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5)).rgb;
	ALBEDO = mix(color, vec3(1.0, 0.1, 0.1), tint);
}
