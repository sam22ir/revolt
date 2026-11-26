shader_type spatial;
// The camp in real 3D (look test): each face's colour from the Blender kit, lit in flat tones by the sun like camp_ink.py, with
// a brushy wash where the kit asked for paint texture (the colour's alpha).
render_mode cull_disabled, specular_disabled;

uniform float shade : hint_range(0.0, 1.0) = 0.6;
uniform float brush = 0.06;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void fragment() {
	// Some kit parts are open sheets (roofs, canvas) facing either way; light their side we see.
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
	float wash = noise(world_pos.xz * 0.05 + world_pos.y * 0.03) * 0.6 + noise(world_pos.xz * 0.21) * 0.4;
	// The kit's colours are linear, but Godot reads vertex colours as sRGB here (they came out squared): convert them once.
	vec3 colour = pow(COLOR.rgb, vec3(1.0 / 2.2));
	ALBEDO = colour * (1.0 + (wash - 0.5) * 2.0 * brush * (0.4 + COLOR.a));
}

void light() {
	float lit = smoothstep(0.02, 0.12, dot(NORMAL, LIGHT)) * ATTENUATION;
	float tone = mix(shade, 1.0, step(0.5, lit)) * mix(0.92, 1.0, step(0.85, lit));
	// LIGHT_COLOR carries a factor of PI in Godot 4.
	DIFFUSE_LIGHT += tone * 0.85 * LIGHT_COLOR / PI;
}
