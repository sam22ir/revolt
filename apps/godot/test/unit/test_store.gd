extends GutTest

func _view(can_redeem := true, owned: Array = [], equipped := {}) -> Dictionary:
	return {
		"products": [
			{"sku": "pass_premium", "kind": "pass", "priceHintUsdCents": 499, "owned": false, "dailyLimit": null},
			{"sku": "speedup_pack_small", "kind": "speedup", "priceHintUsdCents": 99, "owned": false, "dailyLimit": 5},
			{"sku": "cosmetic_outfit_coat", "kind": "cosmetic", "priceHintUsdCents": 249, "owned": owned.has("outfit_coat"), "dailyLimit": null},
			{"sku": "not_a_product", "kind": "bundle", "priceHintUsdCents": 1, "owned": false},
		],
		"wallet": {"speedupTokens": 0, "usedTodayMs": 0, "dailyCapMs": 3600000},
		"cosmetics": {"owned": owned, "equipped": equipped},
		"canRedeem": can_redeem,
		"now": 1000,
	}

func test_offers_sell_only_when_play_and_the_server_both_can() -> void:
	assert_true(StoreModel.can_buy(_view(), true))
	assert_false(StoreModel.can_buy(_view(false), true), "server cannot check receipts")
	assert_false(StoreModel.can_buy(_view(), false), "no Play billing")
	assert_false(StoreModel.can_buy({}, true))
	for r in StoreModel.rows(_view(), false):
		assert_false(r["enabled"], r["sku"])

func test_rows_follow_the_server_skip_unknown_skus_and_carry_token_counts() -> void:
	var rows := StoreModel.rows(_view(true, ["outfit_coat"]), true)
	assert_eq(rows.map(func(r: Dictionary) -> String: return r["sku"]), ["pass_premium", "speedup_pack_small", "cosmetic_outfit_coat"])
	assert_eq(rows[1]["tokens"], 5)
	assert_eq(rows[1]["cents"], 99)
	assert_true(rows[0]["enabled"])
	assert_true(rows[2]["owned"])
	assert_false(rows[2]["enabled"], "owned is not sold again")

func test_price_hints_are_written_per_language() -> void:
	assert_eq(StoreModel.price_text("en", 499), "$4.99")
	assert_eq(StoreModel.price_text("fr", 499), "4,99 $")
	assert_eq(StoreModel.price_text("ar", 99), "0.99 $")
	assert_eq(StoreModel.price_text("en", 1000), "$10.00")

func test_every_look_has_a_slot() -> void:
	for id: String in Balance.data()["cosmeticIds"]:
		assert_has(StoreModel.SLOTS, StoreModel.slot_of(id), id)
	assert_eq(StoreModel.slot_of("nonsense"), "")

func test_the_wardrobe_groups_owned_looks_and_marks_the_worn_one() -> void:
	var w := StoreModel.wardrobe(_view(true, ["outfit_coat", "banner_plain", "outfit_field"], {"hero_outfit": "outfit_coat"}))
	assert_eq(w.map(func(s: Dictionary) -> String: return s["slot"]), ["banner", "hero_outfit"])
	assert_eq(w[1]["items"], [{"id": "outfit_coat", "worn": true}, {"id": "outfit_field", "worn": false}])
	assert_eq(StoreModel.wardrobe(_view()), [])

func test_purchase_notes() -> void:
	assert_eq(StoreModel.redeemed_note(PurchaseFlow.Outcome.GRANTED, {"ok": true}), "live.note.granted")
	assert_eq(StoreModel.redeemed_note(PurchaseFlow.Outcome.RETRY, null), "live.note.unreachable")
	assert_eq(StoreModel.redeemed_note(PurchaseFlow.Outcome.REFUSED, {"ok": false, "reason": "daily_limit"}), "reason.daily_limit")
	assert_eq(StoreModel.redeemed_note(PurchaseFlow.Outcome.REFUSED, {"error": "bad_request"}), "reason.bad_receipt")
	assert_eq(StoreModel.failed_note(1), "live.note.cancelled")
	assert_eq(StoreModel.failed_note(-1), "live.note.billing_unavailable")
	for key: String in ["live.note.granted", "live.note.unreachable", "reason.daily_limit", "reason.already_owned", "reason.bad_receipt", "live.note.cancelled", "live.note.billing_unavailable", "live.tab.store"]:
		for lang in ["en", "ar"]:
			TranslationServer.set_locale(lang)
			assert_ne(Loc.t(key), key, "%s in %s" % [key, lang])
	TranslationServer.set_locale("en")

func _screen(view: Dictionary, selling: bool) -> StoreScreen:
	var session := Session.new(autofree(Api.new()), Clock.new())
	session.store = view
	var page := StoreScreen.new()
	add_child_autofree(page)
	page.setup(session, func() -> bool: return selling)
	page.visible = true
	page.refresh()
	return page

func _buy(page: StoreScreen, sku: String) -> Button:
	return page.find_child("Offer_" + sku, true, false).find_child("Buy", true, false) as Button

func test_the_page_sells_when_it_can_and_says_why_not_when_it_cannot() -> void:
	var page := _screen(_view(), true)
	watch_signals(page)
	var buy := _buy(page, "pass_premium")
	assert_false(buy.disabled)
	buy.pressed.emit()
	assert_signal_emitted_with_parameters(page, "buy_requested", ["pass_premium"])
	assert_true(buy.disabled, "one press, one purchase")
	var off := _screen(_view(), false)
	assert_true(_buy(off, "pass_premium").disabled)
	var texts := off.find_children("*", "Label", true, false).map(func(l: Label) -> String: return l.text)
	assert_has(texts, Loc.t("live.store.unavailable"))
	assert_has(texts, Loc.t("live.store.fairNote"))

func test_the_page_shows_a_note_and_wears_looks() -> void:
	var page := _screen(_view(true, ["outfit_coat"], {"hero_outfit": "outfit_coat"}), true)
	page.set_note("live.note.granted")
	assert_eq((page.find_child("Note", true, false) as Label).text, Loc.t("live.note.granted"))
	watch_signals(page)
	(page.find_child("Wear_outfit_coat", true, false) as Button).pressed.emit()
	assert_signal_emitted_with_parameters(page, "equip_requested", ["hero_outfit", ""])
