shader_type canvas_item;
// The map's ground in ink (docs/map-ground-ink-plan.md): materials that meet along ragged edges, hills and mesas whose rock faces
// hang down the screen from their true edge, riverbeds cut below the ground, roads and pools. Everything is read from two small
// fields over the map (GroundField) and shaken by noise, so no tile shows. Lengths are world px unless said otherwise.

// Per tile: r height, g the height mountains rise by (kept clear of other land), b fertility, a rocks (above 0.5) or grove (below).
uniform sampler2D land : filter_linear, repeat_disable;
// Distances in tiles: r road, g riverbed (both over NEAR), b pool (over FAR).
uniform sampler2D feature : filter_linear, repeat_disable;
uniform sampler2D noise_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2DArray materials : filter_linear_mipmap, repeat_enable;
uniform sampler2D cliff_tex : filter_linear_mipmap, repeat_enable;
// Per tile: r the region (id / 255), g 1 where it is liberated.
uniform sampler2D regions : filter_nearest, repeat_disable;
uniform float map_size = 64.0;
// The frontier's raked strip, in tiles past the edge.
uniform float strip_from = 0.3;
uniform float strip_to = 2.4;

// Slices of `materials` (tools/blender/map_ground.py, COLOURS).
const float SAND = 0.0;
const float STEPPE = 1.0;
const float MEADOW = 2.0;
const float FOREST = 3.0;
const float GRAVEL = 4.0;
const float ROCK = 5.0;
const float NEAR = 0.8;
const float FAR = 2.0;
const float REPEAT = 512.0;
const vec2 CLIFF = vec2(1024.0, 96.0);
// Where the land steps up (height), and how far its face hangs below the edge.
const float T1 = 0.58;
const float T2 = 0.735;
const float T3 = 0.80;
const vec4 DROP = vec4(0.0, 11.0, 40.0, 68.0);
const float STEP = 4.0;
const int STEPS = 17;
const vec3 INK = vec3(0.17, 0.115, 0.085);
const vec3 OUTSIDE = vec3(0.80, 0.765, 0.72);

varying vec2 world;

void vertex() {
	world = VERTEX;
}

vec2 tile_of(vec2 w) {
	return vec2(w.y / 48.0 + w.x / 96.0, w.y / 48.0 - w.x / 96.0);
}

// The field's place for tile `t`: past the edge it is the map mirrored.
vec2 place(vec2 t) {
	return 1.0 - abs(mod(t / map_size, 2.0) - 1.0);
}

float level(vec4 l) {
	return step(T1, l.r) + step(T2, l.g) + step(T3, l.g);
}

float drop_of(float lvl) {
	return lvl < 0.5 ? DROP.x : (lvl < 1.5 ? DROP.y : (lvl < 2.5 ? DROP.z : DROP.w));
}

vec3 ink_over(vec3 c, float amount) {
	return mix(c, c * 0.22 + INK * 0.75, clamp(amount, 0.0, 1.0));
}

void fragment() {
	float px = max(fwidth(world.x), 0.0001);
	// Thin lines fade when the map is far away instead of shimmering.
	float near_view = 1.0 - smoothstep(1.4, 3.2, px);
	vec4 n_wide = texture(noise_tex, world / vec2(2300.0, 1150.0));
	vec4 n_mid = texture(noise_tex, world / vec2(610.0, 305.0) + 0.37);
	vec4 n_fine = texture(noise_tex, world / vec2(150.0, 75.0) + 0.71);
	vec2 t = tile_of(world);
	vec2 shake = (n_mid.rg - 0.5) * 1.1 + (n_fine.rg - 0.5) * 0.16;
	vec2 tw = t + shake;
	vec4 here = texture(land, place(tw));
	vec4 feat = texture(feature, place(t + (n_fine.ba - 0.5) * 0.16));
	float lvl = level(here);

	// ---- Is this a rock face? Look up the screen for higher land whose face reaches down to here.
	float depth = -1.0;
	float face_drop = 0.0;
	float face_level = 0.0;
	if (max(here.r, max(texture(land, place(tw - vec2(20.0 / 48.0))).r, texture(land, place(tw - vec2(56.0 / 48.0))).r)) > 0.5) {
		vec4 before = here;
		for (int i = 1; i <= STEPS; i++) {
			float e = float(i) * STEP;
			vec4 q = texture(land, place(tw - vec2(e / 48.0)));
			float lq = level(q);
			float reach = drop_of(lq) - drop_of(lvl);
			if (lq > lvl && e - STEP < reach) {
				// Where between the two looks the edge is.
				float th = lq > 2.5 ? T3 : (lq > 1.5 ? T2 : T1);
				float a = lq > 1.5 ? before.g : before.r;
				float b = lq > 1.5 ? q.g : q.r;
				float back = clamp((b - th) / max(b - a, 0.0005), 0.0, 1.0);
				depth = e - back * STEP;
				if (depth < reach) {
					face_drop = reach;
					face_level = lq;
					break;
				}
				depth = -1.0;
			}
			before = q;
		}
	}

	vec2 uv = world / REPEAT;
	vec3 sand = texture(materials, vec3(uv, SAND)).rgb;
	vec3 colour;
	if (depth >= 0.0) {
		// ---- The face.
		float v = clamp(depth / CLIFF.y, 0.02, 0.98) + (face_level - 1.0) * 0.0;
		vec3 rock = texture(cliff_tex, vec2((world.x + (n_mid.b - 0.5) * 30.0) / CLIFF.x + face_level * 0.37, v)).rgb;
		float deep = depth / max(face_drop, 1.0);
		colour = rock * mix(1.04, 0.74, deep);
		if (face_level < 1.5) {
			// A hill's ledge is earth, not rock.
			colour = mix(sand * vec3(0.80, 0.77, 0.74), rock * 1.06, 0.4) * mix(1.04, 0.9, deep);
		}
		float w = face_level < 1.5 ? 0.6 : 1.0;
		colour = ink_over(colour, (1.0 - smoothstep(w, w + 0.8 + px, depth)) * mix(0.35, 0.9, near_view) * (face_level < 1.5 ? 0.6 : 1.0));
		colour = ink_over(colour, smoothstep(face_drop - 1.6 - px, face_drop - 0.6, depth) * mix(0.3, 0.75, near_view) * (face_level < 1.5 ? 0.55 : 1.0));
	} else {
		// ---- The ground's materials.
		float ragged = (n_fine.r - 0.5) * 0.16 + (n_mid.b - 0.5) * 0.22;
		float green = here.b + ragged;
		float grove = (0.5 - here.a) * 2.0;
		float rocks = (here.a - 0.5) * 2.0;
		float road = feat.r * NEAR;
		float bed = feat.g * NEAR;
		float pool = feat.b * FAR;
		float oasis = 1.0 - smoothstep(0.9, 1.75, pool + ragged);
		green = max(green, oasis * 1.2);
		green += max(grove, 0.0) * 0.25;
		float soft = 0.010 + px * 0.004;
		colour = sand;

		// Dunes on bare, level ground.
		float bare = (1.0 - smoothstep(0.26, 0.38, here.b)) * smoothstep(0.50, 0.60, n_wide.r) * (1.0 - smoothstep(0.05, 0.2, rocks)) * step(lvl, 0.5);
		bare *= smoothstep(0.30, 0.55, road) * smoothstep(0.5, 0.75, bed);
		if (bare > 0.01) {
			float s = (world.y * 1.0 + world.x * 0.22) / 64.0 + (n_mid.r - 0.5) * 3.2 + (n_wide.g - 0.5) * 5.0;
			float f = fract(s);
			float ridge = smoothstep(0.30, 0.62, n_mid.a + (n_fine.g - 0.5) * 0.25) * bare;
			float lee = smoothstep(0.50, 0.515, f) * (1.0 - smoothstep(0.52, 0.86, f));
			float sunny = smoothstep(0.12, 0.5, f) * (1.0 - step(0.5, f));
			colour *= 1.0 + ridge * (sunny * 0.10 - lee * 0.20);
			float crest = 1.0 - smoothstep(0.0, 0.016 + px * 0.012, abs(f - 0.505));
			colour = ink_over(colour, crest * ridge * 0.55 * near_view * smoothstep(0.35, 0.6, n_fine.b + 0.1));
		}

		float steppe = smoothstep(0.50 - soft, 0.50 + soft, green);
		float meadow = smoothstep(0.76 - soft, 0.76 + soft, green);
		float stony = smoothstep(0.30 - soft, 0.30 + soft, rocks + ragged * 1.4 - max(green - 0.6, 0.0));
		float wood = 1.0 - smoothstep(0.315 - soft * 0.5, 0.315 + soft * 0.5, here.r + ragged * 0.12);
		colour = mix(colour, texture(materials, vec3(uv, STEPPE)).rgb, steppe);
		colour = mix(colour, texture(materials, vec3(uv, GRAVEL)).rgb, stony);
		colour = mix(colour, texture(materials, vec3(uv, MEADOW)).rgb, meadow);
		colour = mix(colour, texture(materials, vec3(uv, FOREST)).rgb, wood);
		// A shade just outside the greener patches, so they sit on the sand.
		float fringe = (smoothstep(0.735, 0.758, green) - meadow) * 0.10 + (smoothstep(0.475, 0.498, green) - steppe) * 0.06;
		fringe += max((1.0 - smoothstep(0.317, 0.335, here.r + ragged * 0.12)) - wood, 0.0) * 0.16;
		colour *= 1.0 - max(fringe, 0.0);
		if (lvl > 0.5) {
			vec3 up = lvl > 1.5 ? texture(materials, vec3(uv, ROCK)).rgb * (lvl > 2.5 ? 1.07 : 1.0) : colour * vec3(1.035, 1.02, 0.99);
			colour = up;
		}

		// ---- Riverbeds.
		float bank = 0.50 + (n_mid.g - 0.5) * 0.22;
		if (bed < bank + 0.16 && lvl < 1.5) {
			float inside = (1.0 - smoothstep(bank - 0.01, bank + 0.01, bed));
			vec3 gravel = texture(materials, vec3(uv * 1.15 + 0.3, GRAVEL)).rgb;
			float bar = smoothstep(0.52, 0.55, n_mid.a * 0.6 + n_fine.r * 0.4);
			vec3 floor_c = mix(gravel * vec3(0.98, 0.97, 0.95), sand * 1.09, bar * 0.85);
			// The bank above hangs into the bed.
			float above = texture(feature, place(t + (n_fine.ba - 0.5) * 0.16 - vec2(10.0 / 48.0))).g * NEAR;
			float above2 = texture(feature, place(t + (n_fine.ba - 0.5) * 0.16 - vec2(5.0 / 48.0))).g * NEAR;
			float wall = smoothstep(bank - 0.015, bank + 0.015, above);
			float wall_top = smoothstep(bank - 0.015, bank + 0.015, above2);
			vec3 earth = texture(cliff_tex, vec2(world.x / CLIFF.x * 1.3, 0.30 + 0.2 * n_fine.a)).rgb;
			floor_c *= 1.0 - 0.12 * smoothstep(bank - 0.22, bank, above);
			floor_c = mix(floor_c, earth * mix(0.78, 0.95, wall_top), wall);
			colour = mix(colour, floor_c, inside);
			float edge = 1.0 - smoothstep(0.012, 0.030 + px * 0.012, abs(bed - bank));
			colour = ink_over(colour, edge * 0.70 * mix(0.5, 1.0, near_view));
			colour *= 1.0 - 0.08 * (1.0 - inside) * (1.0 - smoothstep(bank, bank + 0.16, bed));
		}

		// ---- Roads.
		float half_w = 0.23 + (n_fine.g - 0.5) * 0.07;
		if (road < half_w + 0.14) {
			float on = (1.0 - smoothstep(half_w - 0.012, half_w + 0.012, road));
			vec3 track = texture(materials, vec3(uv * 1.3 + 0.17, SAND)).rgb * vec3(1.08, 1.055, 1.02);
			float rut = 1.0 - smoothstep(0.02, 0.055, abs(road - 0.115));
			track *= 1.0 - rut * 0.15 * (0.6 + 0.4 * n_fine.r);
			colour = mix(colour, track, on);
			float rim = 1.0 - smoothstep(0.008, 0.024 + px * 0.012, abs(road - half_w));
			colour = ink_over(colour, rim * 0.48 * smoothstep(0.30, 0.48, n_fine.a + 0.08) * mix(0.35, 1.0, near_view));
			colour *= 1.0 - 0.07 * (1.0 - on) * (1.0 - smoothstep(half_w, half_w + 0.14, road));
		}

		// ---- Pools.
		float shore = 0.66 + (n_mid.r - 0.5) * 0.42;
		if (pool < shore + 0.3) {
			float wet = (1.0 - smoothstep(shore - 0.012, shore + 0.012, pool));
			vec3 water = mix(vec3(0.235, 0.46, 0.475), vec3(0.50, 0.70, 0.63), smoothstep(shore - 0.34, shore - 0.10, pool));
			water = mix(water, vec3(0.80, 0.86, 0.74), smoothstep(shore - 0.075, shore - 0.06, pool) * 0.75);
			float ring = sin((pool * 26.0 + n_mid.b * 9.0));
			water += 0.07 * smoothstep(0.86, 0.95, ring) * step(pool, shore - 0.12) * near_view;
			colour *= mix(vec3(1.0), vec3(0.80, 0.80, 0.72), (1.0 - smoothstep(shore, shore + 0.26, pool)) * 0.8);
			colour = mix(colour, water, wet);
			float line = 1.0 - smoothstep(0.016, 0.034 + px * 0.012, abs(pool - shore));
			colour = ink_over(colour, line * 0.85);
		}

		// ---- The far and side edges of raised land: an inked rim just inside it, and shade at a face's foot.
		if (here.r > T1 - 0.06) {
			vec4 right = texture(land, place(tw + tile_of(vec2(3.0, 0.0))));
			vec4 down = texture(land, place(tw + tile_of(vec2(0.0, 3.0))));
			float slope_r = max(length(vec2(right.r - here.r, down.r - here.r)) / 3.0, 0.00025);
			float slope_g = max(length(vec2(right.g - here.g, down.g - here.g)) / 3.0, 0.00025);
			float d1 = (here.r - T1) / slope_r;
			float d2 = (here.g - T2) / slope_g;
			float d3 = (here.g - T3) / slope_g;
			float thin = 0.55 + px * 0.5;
			float l1 = step(0.0, d1) * (1.0 - smoothstep(thin, thin + 0.7, d1)) * step(lvl, 1.5);
			float l2 = step(0.0, d2) * (1.0 - smoothstep(thin + 0.4, thin + 1.2, d2)) * step(lvl, 2.5);
			float l3 = step(0.0, d3) * (1.0 - smoothstep(thin + 0.4, thin + 1.2, d3));
			colour *= 1.0 + 0.06 * (1.0 - smoothstep(0.0, 9.0, max(d1, 0.0))) * step(0.5, lvl) * step(lvl, 1.5);
			colour *= 1.0 + 0.09 * (1.0 - smoothstep(0.0, 8.0, lvl > 2.5 ? d3 : d2)) * step(1.5, lvl);
			colour = ink_over(colour, l1 * 0.42 * mix(0.4, 1.0, near_view) * smoothstep(0.28, 0.45, n_fine.b + 0.1));
			colour = ink_over(colour, max(l2, l3) * 0.88);
		}
	}

	// ---- Region borders: a soft shade and a dashed light line along the tile edges between regions, gold round liberated ones.
	vec2 past = max(max(-t, t - map_size), 0.0);
	float outside = max(past.x, past.y);
	if (outside <= 0.0) {
		vec2 cell = floor(t);
		vec2 f = t - cell;
		vec4 own = texture(regions, (cell + 0.5) / map_size);
		float d = 9.0;
		float gold = own.g;
		for (int k = 0; k < 8; k++) {
			vec2 o = vec2(float(k == 0) - float(k == 1) + float(k == 4) - float(k == 5) + float(k == 6) - float(k == 7), float(k == 2) - float(k == 3) + float(k == 4) - float(k == 5) - float(k == 6) + float(k == 7));
			vec2 nc = cell + o;
			if (nc.x < 0.0 || nc.y < 0.0 || nc.x >= map_size || nc.y >= map_size) {
				continue;
			}
			vec4 other = texture(regions, (nc + 0.5) / map_size);
			if (abs(other.r - own.r) > 0.001) {
				vec2 to = mix(f, 1.0 - f, step(0.5, o)) * abs(o);
				float dist = (abs(o.x) + abs(o.y)) > 1.5 ? length(to) : max(to.x, to.y);
				if (dist < d) {
					d = dist;
				}
				gold = max(gold, other.g);
			}
		}
		colour = mix(colour, colour * vec3(1.05, 0.97, 0.80), own.g * 0.30);
		float band = 1.0 - smoothstep(0.0, 0.16, d);
		colour *= 1.0 - band * 0.10;
		float dash = step(0.42, fract((t.x + t.y) * 2.2));
		float line = (1.0 - smoothstep(0.02, 0.045, d)) * dash;
		colour = mix(colour, mix(vec3(0.99, 0.94, 0.80), vec3(0.98, 0.78, 0.30), gold), line * mix(0.42, 0.85, gold) * mix(0.6, 1.0, near_view));
	}

	// ---- The frontier's raked strip.
	float in_strip = smoothstep(strip_from - 0.25, strip_from, outside) * (1.0 - smoothstep(strip_to, strip_to + 0.8, outside));
	if (in_strip > 0.0) {
		vec3 raked = texture(materials, vec3(uv * 1.4, SAND)).rgb * vec3(1.06, 1.04, 1.0);
		float rake = smoothstep(0.55, 0.75, fract(outside * 10.0 + (n_fine.r - 0.5) * 0.3));
		raked *= 1.0 - rake * 0.07 * near_view;
		colour = mix(colour, raked, in_strip);
	}

	// ---- Slow drifts of light and warmth over the whole map, cloud shadows passing, and the duller land outside.
	float cloud = texture(noise_tex, (world + TIME * vec2(11.0, 5.5)) / vec2(2600.0, 1300.0) + 0.5).g;
	colour *= 1.0 - 0.07 * smoothstep(0.56, 0.72, cloud);
	colour *= 1.0 + (n_wide.b - 0.5) * 0.16;
	colour *= mix(vec3(0.985, 1.0, 1.02), vec3(1.02, 1.0, 0.97), n_wide.a);
	colour *= mix(vec3(1.0), OUTSIDE, smoothstep(strip_to, strip_to + 1.5, outside));
	COLOR = vec4(colour, 1.0);
}
