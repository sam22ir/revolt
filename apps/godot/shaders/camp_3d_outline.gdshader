shader_type spatial;
// The ink round the camp's 3D shapes (look test): the back faces pushed out along their normals and drawn dark, so a line shows
// where a shape ends against what is behind it.
render_mode unshaded, cull_front;

uniform float width = 1.4;
uniform vec4 ink : source_color = vec4(0.17, 0.13, 0.11, 1.0);

void vertex() {
	VERTEX += NORMAL * width;
}

void fragment() {
	ALBEDO = ink.rgb;
}
