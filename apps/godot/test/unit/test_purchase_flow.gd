extends GutTest

const TOKEN := "play-purchase-token-abc123"

func _purchase(state := PurchaseFlow.STATE_PURCHASED, ids: Array = ["bundle_small"], token := TOKEN) -> Dictionary:
	return {"product_ids": ids, "purchase_token": token, "purchase_state": state, "order_id": "GPA.1"}

func test_a_bought_purchase_becomes_a_google_redeem() -> void:
	assert_eq(PurchaseFlow.redeem_body(_purchase()), {"sku": "bundle_small", "provider": "google", "receipt": TOKEN})

func test_pending_and_malformed_purchases_are_not_redeemed() -> void:
	assert_eq(PurchaseFlow.redeem_body(_purchase(2)), {}, "pending")
	assert_eq(PurchaseFlow.redeem_body(_purchase(PurchaseFlow.STATE_PURCHASED, [])), {}, "no product")
	assert_eq(PurchaseFlow.redeem_body(_purchase(PurchaseFlow.STATE_PURCHASED, ["a", "b"])), {}, "two products")
	assert_eq(PurchaseFlow.redeem_body(_purchase(PurchaseFlow.STATE_PURCHASED, ["bundle_small"], "")), {}, "no token")
	assert_eq(PurchaseFlow.redeem_body({}), {}, "empty")

func test_granted_and_duplicate_are_consumed() -> void:
	assert_eq(PurchaseFlow.outcome({"ok": true, "status": 200, "data": {"duplicate": false}}), PurchaseFlow.Outcome.GRANTED)
	assert_eq(PurchaseFlow.outcome({"ok": true, "status": 200, "data": {"duplicate": true}}), PurchaseFlow.Outcome.GRANTED)

func test_outages_keep_the_purchase_for_a_retry() -> void:
	for status: int in [0, 503, 500, 429]:
		assert_eq(PurchaseFlow.outcome({"ok": false, "status": status, "data": null}), PurchaseFlow.Outcome.RETRY, str(status))

func test_refusals_are_never_consumed_so_google_refunds_them() -> void:
	for status: int in [400, 401, 403, 409]:
		assert_eq(PurchaseFlow.outcome({"ok": false, "status": status, "data": {"error": "x"}}), PurchaseFlow.Outcome.REFUSED, str(status))

func test_without_the_plugin_billing_sells_nothing() -> void:
	var b := Billing.new()
	add_child_autofree(b)
	b.setup(Api.new())
	assert_false(b.available())
	watch_signals(b)
	b.buy("bundle_small")
	assert_signal_emitted_with_parameters(b, "purchase_failed", [-1])
