# Plixiele subscriptions — manual setup steps

Phase 2 of the backend ships with all the client + server code wired. To go
live with real subscriptions you need to do a few things in the Stripe and
Firebase consoles that can't be automated from here.

## 1. Stripe account

1. Sign up at https://stripe.com (or sign in if you already have one).
2. Activate the account: legal entity, bank account for payouts, tax info.
3. Switch to **Test mode** while building. Live mode comes after end-to-end testing.
4. Note your test API keys at <https://dashboard.stripe.com/test/apikeys>.
   You'll paste these into the Firebase extension config below.

## 2. Install the Firebase Stripe extension

```
firebase ext:install invertase/firestore-stripe-payments --project plixiele-sign-in
```

When prompted, paste:

| Param | Value |
|---|---|
| `STRIPE_API_KEY` | Your **secret** test key (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Leave blank — extension generates one and gives you a webhook URL after install |
| `PRODUCTS_COLLECTION` | `products` |
| `CUSTOMERS_COLLECTION` | `customers` |
| `SYNC_USERS_ON_CREATE` | `Sync` |
| `LOCATION` | `us-central1` (matches our other functions) |

After install, go to <https://dashboard.stripe.com/test/webhooks>, add the
endpoint the extension printed in the install output, and paste the resulting
signing secret back into the extension config (`firebase ext:configure`).

## 3. Create the products in Stripe

For each tier (Basic / Pro / Premium):

1. Stripe dashboard → Products → **+ Add product**
2. Name: `Plixiele Basic` / `Pro` / `Premium`
3. Pricing: Recurring, Monthly, USD. Use $10 / $20 / $100.
4. Under **Metadata**, add:
   - `plan`: `basic` (or `pro` / `premium`)
5. Save. The extension will mirror the product into Firestore at
   `products/{productId}` and the price at `products/{productId}/prices/{priceId}`.
   Make sure the `active: true` flag is on both.

The pricing page reads `products/{*}/prices/{*}` and groups by the `metadata.plan`
key, so the **`plan` metadata is required** for the upgrade buttons to work.

## 4. Wire price → tier in `functions/index.js`

Open `functions/index.js` and fill in `PRICE_TO_PLAN` with the price IDs you
just created:

```js
const PRICE_TO_PLAN = {
  'price_xxxBasic':   'basic',
  'price_xxxPro':     'pro',
  'price_xxxPremium': 'premium',
}
```

Find the IDs in Stripe under each product → Pricing section, or in Firestore
under `products/{productId}/prices/{priceId}`.

Redeploy the functions afterwards:

```
firebase deploy --only functions
```

## 5. Customer portal (optional but recommended)

In Stripe → Settings → Billing → Customer portal, enable the portal so users
can cancel subscriptions, update payment methods, and download invoices.

We can wire a "Manage subscription" button in the pricing page later — it
calls `customers/{uid}/portal_links` and the extension issues a Stripe
portal URL.

## 6. Live mode

When you're ready to charge real money:

1. Test the full flow in Test mode (Stripe gives test card numbers).
2. Switch the extension config to use the live key (`sk_live_…`) and the live
   webhook secret.
3. Re-create the products and prices in Live mode (test data doesn't carry
   over). Update `PRICE_TO_PLAN` with the live price IDs.
4. In Stripe → Settings → Tax, configure automatic tax calculation if
   relevant for your jurisdiction.

## How the in-app flow works

- User opens **Pricing** in the sidebar.
- Pricing page reads `products/*/prices/*` from Firestore.
- Clicking upgrade writes to `customers/{uid}/checkout_sessions/{id}`.
- The Stripe extension watches that path, creates a Stripe Checkout session,
  writes the URL back. The page redirects automatically.
- Stripe collects payment, fires a webhook back to the extension.
- The extension writes `customers/{uid}/subscriptions/{subId}` with the
  current status.
- Our `onSubscriptionWrite` function (in `functions/index.js`) maps the
  Stripe price ID to a plan tier, sets `users/{uid}.plan` and refills
  credits accordingly.
- The client subscribes to the user doc and reflects the new plan everywhere.

## How credits work

- Generations cost 10 credits. Chat replies cost 2.
- Plan allowances (refilled monthly): Free 60 / Basic 600 / Pro 1500 / Premium 5000.
- Server-side checks credit balance before forwarding to the AI provider and
  decrements atomically. Failed requests refund the cost.
- The `resetMonthlyCredits` scheduled function refills everyone on the 1st of
  each month UTC.
