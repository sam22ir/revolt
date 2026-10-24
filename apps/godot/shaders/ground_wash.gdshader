shader_type canvas_item;
// The green wash of ground-bake.ts paintGreen: the grain's alpha (mottling in world space, repeating every 256 px from the
// origin) times the fertility alpha, at GREEN_ALPHA 0.6 in the grain's colour 58,70,32.
uniform sampler2D fertility : filter_linear, repeat_disable;
uniform sampler2D grain : filter_linear, repeat_enable;
uniform float strength = 0.6;

varying vec2 world;

void vertex() {
	world = VERTEX;
}

void fragment() {
	float f = texture(fertility, UV).a;
	float g = texture(grain, fract(world / 256.0)).a;
	COLOR = vec4(58.0 / 255.0, 70.0 / 255.0, 32.0 / 255.0, f * g * strength);
}
