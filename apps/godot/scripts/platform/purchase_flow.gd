class_name PurchaseFlow
extends RefCounted
## What to do with a Play purchase after the server answered its redeem (POST /v1/store/redeem). Pure, so it is tested
## without the store. The server decides what a purchase grants; the client only decides when to tell Google it is done.
##
## - GRANTED: the server granted it (or had already: `duplicate`). Consume it, so Play stops listing it and the same
##   product can be bought again. Every product is consumed: ownership of passes and cosmetics lives on the server.
## - RETRY: the server or the store could not be reached, or Play still says PENDING. Keep the purchase; it is sent again
##   at the next start-up (Billing.reconcile). Nothing is lost, because Play keeps listing an unconsumed purchase.
## - REFUSED: the server refused it for good (bad receipt, already owned, daily limit). Never consume it: Google refunds a
##   purchase that is not acknowledged within three days, so the player is not charged for nothing.

enum Outcome { GRANTED, RETRY, REFUSED }

## The provider name the server's RevenueCat verifier accepts.
const PROVIDER := "google"

## `purchase_state` from the billing plugin: 1 is PURCHASED, 2 is PENDING (Play Billing's Purchase.PurchaseState).
const STATE_PURCHASED := 1

## The redeem body for one purchase, or {} when the purchase is not one we can redeem yet.
static func redeem_body(purchase: Dictionary) -> Dictionary:
	var ids: Array = purchase.get("product_ids", [])
	var token := String(purchase.get("purchase_token", ""))
	if ids.size() != 1 or token == "" or int(purchase.get("purchase_state", 0)) != STATE_PURCHASED:
		return {}
	return {"sku": String(ids[0]), "provider": PROVIDER, "receipt": token}

## Reads an Api result ({ok, status, data}) of the redeem call.
static func outcome(result: Dictionary) -> Outcome:
	if result.get("ok", false):
		return Outcome.GRANTED
	var status := int(result.get("status", 0))
	# 0: never reached the server. 5xx: billing not configured or the store is down. 429: too many tries this hour.
	if status == 0 or status >= 500 or status == 429:
		return Outcome.RETRY
	return Outcome.REFUSED
