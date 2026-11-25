class_name MarchesStrip
extends StatusPill
## The context strip's map half: how many of the player's marches are in flight. Beside a running upgrade it is `compact`: the banner and
## the number only. The builders half is the QueuePill.

const COMPACT_WIDTH := 66.0

var _count := -1
var _compact := false

func _init() -> void:
	super("marches")
	set_count(0)

func set_count(count: int) -> void:
	if count == _count:
		return
	_count = count
	refresh()

## Gives its room to the builders' pill, when both show.
func set_compact(compact: bool) -> void:
	if compact == _compact:
		return
	_compact = compact
	size_flags_horizontal = Control.SIZE_FILL if compact else Control.SIZE_EXPAND_FILL
	custom_minimum_size.x = HudTheme.px(COMPACT_WIDTH) if compact else 0.0
	refresh()

func refresh() -> void:
	if _count < 0:
		return
	title.text = Fmt.amount(Fmt.lang(), _count) if _compact else text()
	icon.set_dimmed(_count == 0)
	gauge.set_warm(_count > 0)
	layout()

func text() -> String:
	return Loc.t("hud.marches", {"count": Fmt.amount(Fmt.lang(), _count)}) if _count > 0 else Loc.t("hud.marchesNone")
