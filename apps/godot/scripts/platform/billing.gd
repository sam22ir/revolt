class_name Billing
extends Node
## Google Play purchases through the official Godot Play Billing plugin (addons/GodotGooglePlayBilling, docs/release.md).
## The client never decides what a purchase is worth: it buys on Play, sends the purchase token to the server, and
## consumes the purchase only once the server granted it (PurchaseFlow). Without the plugin (desktop, web, tests) the
## store is browse-only: `available()` is false and nothing is sold.

## The server answered a purchase: the outcome (PurchaseFlow.Outcome), the sku, and the server's reply data.
signal redeemed(outcome: int, sku: String, data: Variant)
## Play reported a failure or a cancel when buying (its BillingResponseCode; 1 is USER_CANCELED).
signal purchase_failed(response_code: int)

const PLUGIN_CLIENT := "res://addons/GodotGooglePlayBilling/BillingClient.gd"
const RESPONSE_OK := 0
## BillingClient.ProductType.INAPP: every product here is a one-time product.
const PRODUCT_INAPP := 0

var _api: Api
## The plugin's BillingClient, or null without the plugin. Untyped: the class only exists when the addon is installed.
var _client: Variant = null
var _ready_to_buy := false

func setup(api: Api) -> void:
	_api = api
	if not OS.has_feature("android") or not ResourceLoader.exists(PLUGIN_CLIENT):
		return
	_client = (load(PLUGIN_CLIENT) as GDScript).new()
	add_child(_client)
	_client.connected.connect(_on_connected)
	_client.disconnected.connect(func() -> void: _ready_to_buy = false)
	_client.on_purchase_updated.connect(_on_purchases)
	_client.query_purchases_response.connect(_on_purchases)
	_client.start_connection()

## Whether this build can buy at all. The server must also say `canRedeem` (GET /v1/store) before the store sells.
func available() -> bool:
	return _client != null and _ready_to_buy

## Opens Play's purchase sheet for one product. The answer arrives as `redeemed` or `purchase_failed`.
func buy(sku: String) -> void:
	if not available():
		purchase_failed.emit(-1)
		return
	_client.purchase(sku)

func _on_connected() -> void:
	_ready_to_buy = true
	reconcile()

## Sends every purchase Play still lists (bought earlier but not consumed: the app closed, the server was down) to the
## server again. Runs whenever the billing connection comes up.
func reconcile() -> void:
	if available():
		_client.query_purchases(PRODUCT_INAPP)

func _on_purchases(response: Dictionary) -> void:
	var code := int(response.get("response_code", RESPONSE_OK))
	if code != RESPONSE_OK:
		purchase_failed.emit(code)
		return
	for p: Variant in response.get("purchases", []):
		if p is Dictionary:
			await _redeem(p)

func _redeem(purchase: Dictionary) -> void:
	var body := PurchaseFlow.redeem_body(purchase)
	if body.is_empty():
		return
	var result := await _api.post_json("/v1/store/redeem", body)
	var outcome := PurchaseFlow.outcome(result)
	if outcome == PurchaseFlow.Outcome.GRANTED:
		_client.consume_purchase(String(body["receipt"]))
	redeemed.emit(outcome, String(body["sku"]), result.get("data"))
