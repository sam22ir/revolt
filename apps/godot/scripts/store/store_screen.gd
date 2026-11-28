class_name StoreScreen
extends PageFrame
## The Store page, opened from the base's corner button: a fair-play note (GDD §8), then the offers with their price hints and a Buy
## button, then the wardrobe of owned looks to wear. When this build cannot sell (no Play billing, or the server cannot check
## receipts) the offers still show, Buy is off and a line says so. Buy and wear go out as signals; the server decides. Fetches the
## store each time it opens. Back announces `closed`.

signal closed
signal buy_requested(sku: String)
## Wear `cosmetic` in `slot`, or take the slot's look off with "".
signal equip_requested(slot: String, cosmetic: String)

var _session: Session
var _billing_available := func() -> bool: return false
var _note_key := ""
var _key := ""

func _init() -> void:
	super("funds")

func _ready() -> void:
	back_pressed.connect(func() -> void: closed.emit())
	visibility_changed.connect(func() -> void:
		if is_visible_in_tree():
			_note_key = ""
			_key = ""
			if _session != null:
				_session.load_wallet()
			_render())
	_render()

## Connects the page to the session it shows and to whether Play billing is ready (Billing.available).
func setup(session: Session, billing_available: Callable) -> void:
	_session = session
	_billing_available = billing_available
	session.store_changed.connect(_render)
	_render()

## Shows a line under the offers (an i18n key), or none with "".
func set_note(key: String) -> void:
	_note_key = key
	_key = ""
	_render()

## Draws the texts again (the language changed).
func refresh() -> void:
	_key = ""
	_render()

func _render() -> void:
	if _session == null or not is_visible_in_tree():
		return
	set_title(Loc.t("live.tab.store"), Loc.t("settings.back"))
	var view := _session.store
	var selling: bool = _billing_available.call()
	var key := "|".join([TranslationServer.get_locale(), JSON.stringify(view), selling, _note_key, _session.online])
	if key == _key:
		return
	_key = key
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	body.add_child(_fair_card())
	if not StoreModel.is_view(view):
		body.add_child(EmptyState.new("funds", Loc.t("live.loading" if _session.online else "live.offlineEmpty")))
		return
	if not StoreModel.can_buy(view, selling):
		body.add_child(UiKit.warning(Loc.t("live.store.unavailable")))
	body.add_child(_offers_card(view, selling))
	body.add_child(_wardrobe_card(view))

func _fair_card() -> Control:
	var card := UiKit.card()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", roundi(HudTheme.px(8)))
	var icon := HudIcon.new("info", 26.0)
	icon.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(icon)
	var text := UiKit.label(Loc.t("live.store.fairNote"), UiKit.SMALL, HudTheme.TEXT_SECOND, false, true)
	text.name = "FairNote"
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(text)
	UiKit.card_body(card).add_child(row)
	return card

func _offers_card(view: Dictionary, selling: bool) -> Control:
	var card := UiKit.section("funds", Loc.t("live.store.products"))
	var inner := UiKit.card_body(card)
	var lang := Fmt.lang()
	var first := true
	for r in StoreModel.rows(view, selling):
		if not first:
			inner.add_child(UiKit.divider())
		first = false
		inner.add_child(_offer_row(r, lang))
	if _note_key != "":
		var note := UiKit.label(Loc.t(_note_key), UiKit.BODY, HudTheme.TEXT, true, true)
		note.name = "Note"
		inner.add_child(note)
	return card

func _offer_row(r: Dictionary, lang: String) -> Control:
	var row := HBoxContainer.new()
	row.name = "Offer_" + String(r["sku"])
	row.add_theme_constant_override("separation", roundi(HudTheme.px(10)))
	var text := VBoxContainer.new()
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.add_child(UiKit.label(Loc.t("product.%s.name" % r["sku"]), UiKit.BODY + 2.0, HudTheme.TEXT, true, true))
	text.add_child(UiKit.label(Loc.t("product.%s.desc" % r["sku"], {"count": Fmt.amount(lang, r["tokens"])}), UiKit.SMALL, HudTheme.TEXT_SECOND, false, true))
	row.add_child(text)
	var side := VBoxContainer.new()
	side.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var price := UiKit.label(StoreModel.price_text(lang, r["cents"]), UiKit.BODY, HudTheme.TEXT, true)
	price.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	side.add_child(price)
	var buy := UiKit.primary_button(Loc.t("live.store.owned" if r["owned"] else "live.store.buy"))
	buy.name = "Buy"
	buy.custom_minimum_size.x = HudTheme.px(96)
	buy.disabled = not r["enabled"]
	var sku: String = r["sku"]
	buy.pressed.connect(func() -> void:
		buy.disabled = true
		buy_requested.emit(sku))
	side.add_child(buy)
	row.add_child(side)
	return row

func _wardrobe_card(view: Dictionary) -> Control:
	var card := UiKit.section("heroes", Loc.t("live.store.wardrobe"))
	var inner := UiKit.card_body(card)
	var slots := StoreModel.wardrobe(view)
	if slots.is_empty():
		inner.add_child(UiKit.label(Loc.t("live.store.noCosmetics"), UiKit.BODY, HudTheme.TEXT_SECOND, false, true))
	for s in slots:
		inner.add_child(UiKit.label(Loc.t("live.slot." + String(s["slot"])), UiKit.BODY, HudTheme.TEXT, true))
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", roundi(HudTheme.px(8)))
		flow.add_theme_constant_override("v_separation", roundi(HudTheme.px(8)))
		for item: Dictionary in s["items"]:
			var worn: bool = item["worn"]
			var b := Button.new()
			b.name = "Wear_" + String(item["id"])
			b.focus_mode = Control.FOCUS_NONE
			b.custom_minimum_size.y = HudTheme.px(UiKit.TAP)
			b.text = Loc.t("cosmetic." + String(item["id"])) + (" · " + Loc.t("live.store.worn") if worn else "")
			HudTheme.dress(b, "amber" if worn else "wood")
			var slot: String = s["slot"]
			var id: String = item["id"]
			b.pressed.connect(func() -> void: equip_requested.emit(slot, "" if worn else id))
			flow.add_child(b)
		inner.add_child(flow)
	return card
