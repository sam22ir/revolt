class_name GameSwitch
extends Button
## A sliding on/off switch: a green track with the knob at the reading end when on, a dark one with the knob at the start when off. Its
## word ("On", "Off") is written on the track, so it does not rest on colour alone.

const WIDTH := 78.0
const HEIGHT := 44.0
const TRACK_H := 34.0
const KNOB := 30.0
const SLIDE_S := 0.14
const KNOB_ART: Texture2D = preload("res://art/kit/switch_knob.svg")

## Kept: a style made inside `_draw` is gone before the frame is drawn.
var _tracks := {true: HudTheme.slice("switch_on", 34.0, 0.0, 0.0), false: HudTheme.slice("switch_off", 34.0, 0.0, 0.0)}
var _on := true
## Where the knob is, 0 (off) to 1 (on).
var _slide := 1.0
var _word := ""
var _tween: Tween

func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	custom_minimum_size = Vector2(WIDTH, HEIGHT) * HudTheme.SCALE
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for state in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]:
		add_theme_stylebox_override(state, StyleBoxEmpty.new())

## Sets the state and its word; `slide` moves the knob instead of jumping it.
func set_on(on: bool, word: String, slide := false) -> void:
	_on = on
	_word = word
	tooltip_text = word
	if _tween != null:
		_tween.kill()
	if slide and is_inside_tree():
		_tween = create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		_tween.tween_method(_set_slide, _slide, 1.0 if on else 0.0, SLIDE_S)
	else:
		_set_slide(1.0 if on else 0.0)
	queue_redraw()

func is_on() -> bool:
	return _on

func word() -> String:
	return _word

func _set_slide(value: float) -> void:
	_slide = value
	queue_redraw()

func _draw() -> void:
	var h := HudTheme.px(TRACK_H)
	var track := Rect2(0.0, (size.y - h) * 0.5, size.x, h)
	draw_style_box(_tracks[_on], track)
	var knob := HudTheme.px(KNOB)
	var pad := (h - knob) * 0.5
	var travel := track.size.x - knob - pad * 2.0
	var at := _slide if not is_layout_rtl() else 1.0 - _slide
	var font: Font = load(UiKit.BOLD)
	var font_size := HudTheme.font(UiKit.SMALL)
	# The word sits on the half the knob leaves free.
	var free_left := at > 0.5
	var room := track.size.x - knob - pad * 3.0
	var x := pad * 1.5 if free_left else pad * 1.5 + knob
	var width := font.get_string_size(_word, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var base := Vector2(x + (room - width) * 0.5, track.get_center().y + font.get_ascent(font_size) * 0.36)
	draw_string_outline(font, base, _word, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, roundi(HudTheme.px(2.4)), HudTheme.BUTTON_INK)
	draw_string(font, base, _word, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, HudTheme.BUTTON_TEXT if _on else HudTheme.TEXT_SECOND)
	draw_texture_rect(KNOB_ART, Rect2(Vector2(pad + travel * at, track.position.y + pad), Vector2.ONE * knob), false)
