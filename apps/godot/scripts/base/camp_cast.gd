class_name CampCast
extends RefCounted
## The people and props that show the player's game in the camp (docs/camp-life-plan.md): workers at the building being
## upgraded, fighters drilling, the wounded resting, piles at full producers, columns going out and coming back, tents and people
## as the camp grows. A pure function of a CampSummary and the time: nothing ticks, and a clock that steps back only moves them back.

## Everyone and everything the summary calls for at `now_ms`, as {id, kind, at, dir, frame}, at most CampLayout.MAX_CAST. What
## matters most comes first, so the cap drops the camp's growth before the game's state.
static func cast(summary: Dictionary, now_ms: int) -> Array:
	var out := []
	var looks: Dictionary = summary.get("looks", {})
	var upgrading := String(summary.get("upgrading", ""))
	if upgrading != "":
		out.append_array(_workers(upgrading, int(looks.get(upgrading, 1)), now_ms))
	for m: Dictionary in summary.get("marches", []):
		out.append_array(_column(m, now_ms))
	if summary.get("training", false):
		for i in CampLayout.DRILL.size():
			out.append(_one("drill", CampLayout.DRILL[i], CampLayout.DRILL_DIR, now_ms, i * 2))
	var resting := mini(ceili(float(summary.get("wounded", 0)) / CampLayout.WOUNDED_PER_FIGURE), CampLayout.WOUNDED.size())
	for i in resting:
		out.append({"kind": "wounded", "at": CampLayout.WOUNDED[i], "dir": 6 if i % 2 == 0 else 7, "frame": 0})
	var piles: Dictionary = summary.get("piles", {})
	for id: String in CampLayout.PILES:
		if piles.has(id):
			out.append({"kind": pile_of(id, piles[id] == "full"), "at": CampLayout.PILES[id], "dir": 0, "frame": 0})
	var hq := int(summary.get("hq", 1))
	for t: Dictionary in CampLayout.TENTS:
		if hq >= int(t["hq"]):
			out.append({"kind": "tent", "at": t["at"], "dir": 0, "frame": 0})
			out.append({"kind": "sitting", "at": t["at"] + CampLayout.BY_TENT, "dir": 5, "frame": 0})
	var by_fire := clampi(roundi(float(summary.get("support_fill", 0.0)) * CampLayout.FIRE_PEOPLE), 0, CampLayout.FIRE_PEOPLE)
	if by_fire > 0:
		out.append({"kind": "fire", "at": CampLayout.FIRE, "dir": 0, "frame": 0})
	for i in by_fire:
		var turn := TAU * (0.15 + float(i) / CampLayout.FIRE_PEOPLE)
		var at := CampLayout.FIRE + Vector2(cos(turn), sin(turn) * 0.5) * CampLayout.FIRE_RADIUS
		out.append({"kind": "sitting", "at": at, "dir": CampLife.way(CampLayout.FIRE - at), "frame": 0})
	out = out.slice(0, CampLayout.MAX_CAST)
	for i in out.size():
		out[i]["id"] = "cast%d:%s" % [i, out[i]["kind"]]
	return out

## The pile a producer shows: a small one when nearly full, a big one when full.
static func pile_of(resource: String, full: bool) -> String:
	var kind: String = {"food": "sacks", "materiel": "crates", "funds": "chest"}[resource]
	return kind + ("_big" if full else "_small")

## Two workers in front of the building, one on each front wall towards its side corner, facing it.
static func _workers(id: String, look: int, now_ms: int) -> Array:
	var line := CampArt.base(id, look)
	return [
		_one("worker", _below(id, look, line[0].lerp(line[1], CampLayout.WORKER_ALONG)), 1, now_ms, 0),
		_one("worker", _below(id, look, line[2].lerp(line[1], CampLayout.WORKER_ALONG)), 3, now_ms, 3),
	]

## The first point straight below `at` that is out of the building's outline, a little further down.
static func _below(id: String, look: int, at: Vector2) -> Vector2:
	var outline := CampArt.outline(id, look)
	var p := at
	for i in 40:
		if not Geometry2D.is_point_in_polygon(p, outline):
			break
		p.y += CampLayout.WORKER_STEP
	return p + Vector2(0.0, CampLayout.WORKER_DROP)

## A figure working on the spot: its loop of frames, started `offset` frames in so two side by side are not in step.
static func _one(kind: String, at: Vector2, dir: int, now_ms: int, offset: int) -> Dictionary:
	return {"kind": kind, "at": at, "dir": dir, "frame": posmod(floori(now_ms / CampLife.STEP_MS) + offset, CampLife.STEPS)}

## A march's column on the way out: it walks out from the bend below the hero hall once it has left, and walks back in to arrive
## there when the march is back. Off the way (not yet left, out of sight, home) it is not drawn.
static func _column(m: Dictionary, now_ms: int) -> Array:
	var way: Array = CampLayout.WAY_OUT
	var length := 0.0
	for i in range(1, way.size()):
		length += (way[i] as Vector2).distance_to(way[i - 1])
	var out := []
	var gone := float(now_ms - int(m["depart"])) / 1000.0 * CampLayout.COLUMN_SPEED
	var left_to_go := float(int(m["back"]) - now_ms) / 1000.0 * CampLayout.COLUMN_SPEED
	var outbound := gone >= 0.0 and gone - CampLayout.COLUMN_GAP * (CampLayout.COLUMN_OUT.size() - 1) <= length
	var inbound := not outbound and left_to_go >= 0.0 and left_to_go - CampLayout.COLUMN_GAP * (CampLayout.COLUMN_IN.size() - 1) <= length
	var kinds: Array[String] = CampLayout.COLUMN_OUT if outbound else CampLayout.COLUMN_IN
	if not (outbound or inbound):
		return out
	for i in kinds.size():
		# Distance from the bend: out, the first walks ahead; in, the first is nearest home and the last gets home as the march is back.
		var d := gone - CampLayout.COLUMN_GAP * i if outbound else left_to_go - CampLayout.COLUMN_GAP * (kinds.size() - 1 - i)
		if d < 0.0 or d > length:
			continue
		var pose := CampLife.along(way, d)
		var dir: int = pose["way"] if outbound else posmod(int(pose["way"]) + CampLife.WAYS / 2, CampLife.WAYS)
		var frame := posmod(floori(now_ms / CampLife.STEP_MS) + i * 2, CampLife.STEPS)
		out.append({"kind": kinds[i], "at": pose["at"], "dir": dir, "frame": frame})
	return out
