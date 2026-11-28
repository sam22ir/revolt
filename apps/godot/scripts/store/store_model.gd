class_name StoreModel
extends RefCounted
## What the Store page shows, from the server's StoreView (GET /v1/store): the offers with their price hints, whether each can be
## bought, and the wardrobe of owned looks. Pure: no nodes, no translation. Prices are hints; Play shows the real price before paying.
## No countdowns and no fake scarcity (GDD §8): every offer is always there at the same price.

## Wardrobe slots in the order the rules list them (COSMETIC_SLOTS), and the id prefix each one's looks share.
const SLOTS: Array[String] = ["base_skin", "banner", "march_skin", "hero_outfit"]
const SLOT_PREFIX := {"skin_": "base_skin", "banner_": "banner", "march_": "march_skin", "outfit_": "hero_outfit"}

## Shape check for an untrusted reply.
static func is_view(v: Variant) -> bool:
	return v is Dictionary and v.get("products") is Array and v.get("cosmetics") is Dictionary and v.has("canRedeem")

## Selling needs both: this build can pay through Play, and the server can check the receipt.
static func can_buy(view: Dictionary, billing_available: bool) -> bool:
	return billing_available and is_view(view) and bool(view["canRedeem"])

## One row per offer, in the server's order: {sku, cents, owned, enabled, tokens}. `tokens` fills the description's {count}.
static func rows(view: Dictionary, billing_available: bool) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not is_view(view):
		return out
	var selling := can_buy(view, billing_available)
	var catalog: Dictionary = Balance.data().get("products", {})
	for p: Variant in view["products"]:
		if not (p is Dictionary and p.get("sku") is String and catalog.has(p["sku"])):
			continue
		var sku: String = p["sku"]
		var owned := bool(p.get("owned", false))
		var grants: Dictionary = catalog[sku].get("grants", {})
		out.append({"sku": sku, "cents": int(p.get("priceHintUsdCents", 0)), "owned": owned, "enabled": selling and not owned, "tokens": int(grants.get("speedupTokens", 0))})
	return out

## A US dollar price hint in the language's way of writing it: "$4.99", "4,99 $", "4.99 $".
static func price_text(lang: String, cents: int) -> String:
	var whole := str(cents / 100)
	var part := "%02d" % (cents % 100)
	match lang:
		"fr":
			return "%s,%s $" % [whole, part]
		"ar":
			return "%s.%s $" % [whole, part]
	return "$%s.%s" % [whole, part]

## The slot a look goes in, or "" for an unknown id.
static func slot_of(cosmetic: String) -> String:
	for prefix: String in SLOT_PREFIX:
		if cosmetic.begins_with(prefix):
			return SLOT_PREFIX[prefix]
	return ""

## The owned looks by slot, slots with none left out: [{slot, items: [{id, worn}]}].
static func wardrobe(view: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not is_view(view):
		return out
	var owned: Array = view["cosmetics"].get("owned", []) if view["cosmetics"].get("owned") is Array else []
	var equipped: Dictionary = view["cosmetics"].get("equipped", {}) if view["cosmetics"].get("equipped") is Dictionary else {}
	for slot in SLOTS:
		var items: Array[Dictionary] = []
		for c: Variant in owned:
			if c is String and slot_of(c) == slot:
				items.append({"id": c, "worn": equipped.get(slot) == c})
		if not items.is_empty():
			out.append({"slot": slot, "items": items})
	return out

## The line under the offers after a purchase: the i18n key for a Billing outcome (PurchaseFlow.Outcome) and the server's reply.
static func redeemed_note(outcome: int, data: Variant) -> String:
	match outcome:
		PurchaseFlow.Outcome.GRANTED:
			return "live.note.granted"
		PurchaseFlow.Outcome.RETRY:
			return "live.note.unreachable"
	var reason := String(data.get("reason", "")) if data is Dictionary else ""
	return "reason." + reason if reason in ["already_owned", "daily_limit", "bad_receipt"] else "reason.bad_receipt"

## The line after Play reported a failure (its BillingResponseCode): 1 is the player cancelling.
static func failed_note(response_code: int) -> String:
	return "live.note.cancelled" if response_code == 1 else "live.note.billing_unavailable"
