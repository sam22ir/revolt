class_name StoryModel
extends RefCounted
## What the Story page shows: the background's chapters (the exported `story` table), the chapter the player is on, each objective's
## progress and whether the reward can be claimed. A port of `packages/rules/src/story.ts` (objectiveProgress, chapterStatus) and the
## client's `storyView`. Pure: no nodes, no translation. The server decides the claim (the intent `story_claim`).

## The chapters of `background` ("" or an unknown one means the default background), in order.
static func chapters(background: String) -> Array:
	var data := Balance.data()
	var story: Dictionary = data.get("story", {})
	var key := background if story.has(background) else String(data.get("defaultBackground", "algeria"))
	return story.get(key, [])

## How many chapters are claimed (the index of the current one).
static func claimed(state: Dictionary) -> int:
	var story: Variant = state.get("story")
	return maxi(0, int(story.get("chapter", 0))) if story is Dictionary else 0

## The chapter the player is on, or {} once every chapter is claimed.
static func current(state: Dictionary, background: String) -> Dictionary:
	var all := chapters(background)
	var i := claimed(state)
	return all[i] if i < all.size() else {}

## Troops owned: at home and out on marches.
static func owned_troops(state: Dictionary) -> int:
	var n := _sum(state.get("troops"))
	var marches: Variant = state.get("marches")
	if marches is Array:
		for m: Variant in marches:
			if m is Dictionary:
				n += _sum(m.get("troops"))
	return n

static func _sum(troops: Variant) -> int:
	var n := 0
	if troops is Dictionary:
		for id: Variant in troops:
			n += maxi(0, int(troops[id]))
	return n

## The best level among the owned heroes, or of one hero (`hero` null or "" means any); 0 when none is owned.
static func best_hero_level(state: Dictionary, hero: Variant) -> int:
	var heroes: Variant = state.get("heroes")
	var owned: Variant = heroes.get("owned") if heroes is Dictionary else null
	if not owned is Dictionary:
		return 0
	var best := 0
	for id: Variant in owned:
		if hero != null and String(hero) != "" and String(hero) != String(id):
			continue
		var h: Variant = owned[id]
		if h is Dictionary:
			best = maxi(best, int(h.get("level", 0)))
	return best

## Progress on one objective: {"done", "have" (capped at need), "need"}. An unknown kind is never done.
static func progress(state: Dictionary, o: Dictionary) -> Dictionary:
	var have := 0
	var need := 1
	match String(o.get("kind", "")):
		"building_level":
			var levels: Variant = state.get("levels")
			have = int(levels.get(String(o.get("building", "")), 0)) if levels is Dictionary else 0
			need = int(o.get("level", 1))
		"troops_owned":
			have = owned_troops(state)
			need = int(o.get("count", 1))
		"hero_recruited":
			have = 1 if best_hero_level(state, o.get("hero")) > 0 else 0
			need = 1
		"hero_level":
			have = best_hero_level(state, o.get("hero"))
			need = int(o.get("level", 1))
		"victories":
			var story: Variant = state.get("story")
			have = int(story.get("victories", 0)) if story is Dictionary else 0
			need = int(o.get("count", 1))
		_:
			return {"done": false, "have": 0, "need": 1}
	return {"done": have >= need, "have": mini(have, need), "need": need}

## "in_progress", "ready" (every objective met, the reward waits) or "complete" (no chapter left).
static func status(state: Dictionary, background: String) -> String:
	var chapter := current(state, background)
	if chapter.is_empty():
		return "complete"
	for o: Variant in chapter.get("objectives", []):
		if not o is Dictionary or not bool(progress(state, o)["done"]):
			return "in_progress"
	return "ready"

## A chapter reward is waiting: the Story button's dot.
static func claimable(state: Dictionary, background: String) -> bool:
	return not state.is_empty() and status(state, background) == "ready"

## An objective's text key and the raw values its text needs (names as ids, numbers as ints; the screen translates them).
static func objective_text(o: Dictionary) -> Dictionary:
	var kind := String(o.get("kind", ""))
	var hero := String(o.get("hero", "")) if o.get("hero") != null else ""
	match kind:
		"building_level":
			return {"key": "story.objective.building_level", "building": String(o.get("building", "")), "level": int(o.get("level", 1))}
		"troops_owned":
			return {"key": "story.objective.troops_owned", "count": int(o.get("count", 1))}
		"hero_recruited":
			return {"key": "story.objective.hero_recruited_named", "hero": hero} if hero != "" else {"key": "story.objective.hero_recruited"}
		"hero_level":
			if hero != "":
				return {"key": "story.objective.hero_level_named", "hero": hero, "level": int(o.get("level", 1))}
			return {"key": "story.objective.hero_level", "level": int(o.get("level", 1))}
		"victories":
			return {"key": "story.objective.victories", "count": int(o.get("count", 1))}
	return {"key": ""}

## The i18n key of a chapter's title, or of its scene `n` (1-based).
static func title_key(background: String, chapter: Dictionary) -> String:
	return "story.%s.%s.title" % [_bg(background), chapter.get("id", "")]

static func scene_key(background: String, chapter: Dictionary, n: int) -> String:
	return "story.%s.%s.scene%d" % [_bg(background), chapter.get("id", ""), n]

static func _bg(background: String) -> String:
	var data := Balance.data()
	return background if data.get("story", {}).has(background) else String(data.get("defaultBackground", "algeria"))

## The reward as items for the chips and the reward popup (MissionsModel.reward_items: resources, then shards).
static func reward_items(chapter: Dictionary) -> Array:
	return MissionsModel.reward_items(chapter.get("reward"))
