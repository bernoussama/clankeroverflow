# Enterprise Discount Tier for `calculateTotal`

## Note on the file

I searched the workspace for `src/billing/pricing.ts` and could not locate it (the workspace under `clankeroverflow-mcp-workspace` contains only eval metadata, no application source tree). So I can't show you a line-accurate diff against your current implementation. Below is the logic you should drop into `calculateTotal(cart)` in that file. If you paste the existing function, I can give you an exact patch.

## What the change should do

Enterprise customers get a **15% discount** on the entire cart when the **subtotal exceeds $10,000**. The key design questions are:

1. **Where does the customer's tier come from?** `calculateTotal(cart)` only receives `cart`, so the enterprise flag must either live on the cart object (e.g. `cart.customer.tier === 'enterprise'`) or be passed in. I'll show the cleanest version assuming the tier is reachable from `cart`, plus a parameterized alternative.
2. **Is the threshold checked against the pre-discount subtotal** (yes — so the discount doesn't disqualify itself).
3. **Rounding** — apply a consistent cents-based rounding to avoid floating-point drift before returning.

## Recommended implementation

```ts
// src/billing/pricing.ts

export const ENTERPRISE_DISCOUNT = {
  rate: 0.15, // 15% off
  minSubtotal: 10_000, // threshold in dollars (pre-discount)
};

export interface Cart {
  // your existing shape; customer/tier is how you opt into enterprise
  customer?: { tier?: "enterprise" | "standard" | string } | null;
  items: Array<{ price: number; quantity: number }>;
  // ...any other fields you already have
}

/**
 * Computes the cart total, applying the enterprise discount tier:
 *   enterprise customers get 15% off when the subtotal exceeds $10,000.
 *
 * Threshold is evaluated against the pre-discount subtotal.
 */
export function calculateTotal(cart: Cart): number {
  const subtotal = subtotalOf(cart);

  const isEnterprise = cart.customer?.tier === "enterprise";
  const qualifies = isEnterprise && subtotal > ENTERPRISE_DISCOUNT.minSubtotal;

  const discount = qualifies ? subtotal * ENTERPRISE_DISCOUNT.rate : 0;
  // round to cents to avoid float drift
  const total = roundCents(subtotal - discount);

  return total;
}

// --- helpers ---

function subtotalOf(cart: Cart): number {
  return roundCents(cart.items.reduce((sum, { price, quantity }) => sum + price * quantity, 0));
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
```

## If you'd rather pass the tier explicitly

If `cart` doesn't carry customer info and you don't want to couple pricing to customer data, overload the signature:

```ts
export function calculateTotal(cart: Cart, opts?: { tier?: string }): number {
  const subtotal = subtotalOf(cart);
  const isEnterprise = opts?.tier === "enterprise";
  const qualifies = isEnterprise && subtotal > ENTERPRISE_DISCOUNT.minSubtotal;
  const discount = qualifies ? subtotal * ENTERPRISE_DISCOUNT.rate : 0;
  return roundCents(subtotal - discount);
}
```

## A few things worth double-checking

- **"Exceeds $10k"** — I treated it strictly (`>` not `>=`), per your wording "exceeds $10k." If a cart of exactly $10,000 should also qualify, switch to `>=`.
- **Discount scope** — 15% off the _entire_ subtotal vs. only the amount over $10k. Your wording ("15% off when cart total exceeds $10k") reads as 15% off the whole cart, which is what I implemented. The marginal/stepped variant (only the portion above 10k discounted) is a different policy; say the word if that's the intent.
- **Tier source** — confirm where `tier === 'enterprise'` actually comes from in your model so the guard reads from the right field.
- **Existing discounts** — if there are already other discounts/coupons in `calculateTotal`, apply the enterprise tier to the appropriate base (typically the merchandise subtotal, before shipping/tax), not on top of other line discounts, to avoid stacking.
- **Tests** — add cases for: enterprise subtotal $9,999.99 (no discount), $10,000.00 (no discount under strict `>`), $10,000.01 (15% off), non-enterprise at $50,000 (no discount), and a rounding check.

## Tests (example)

```ts
describe("calculateTotal enterprise tier", () => {
  const ent = { customer: { tier: "enterprise" } };
  const std = { customer: { tier: "standard" } };

  const cart = (base: Record<string, unknown>, price: number) =>
    ({ ...base, items: [{ price, quantity: 1 }] }) as any;

  it("applies 15% above threshold for enterprise", () => {
    expect(calculateTotal(cart(ent, 20_000))).toBe(17_000); // 20000 - 15%
  });

  it("does not apply at exactly 10000 (strict exceeds)", () => {
    expect(calculateTotal(cart(ent, 10_000))).toBe(10_000);
  });

  it("does not apply below threshold for enterprise", () => {
    expect(calculateTotal(cart(ent, 9_999.99))).toBe(9_999.99);
  });

  it("ignores tier for non-enterprise above threshold", () => {
    expect(calculateTotal(cart(std, 50_000))).toBe(50_000);
  });
});
```

Paste your current `calculateTotal(cart)` and I'll convert this into an exact line-by-line edit.
