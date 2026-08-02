# Checkout History and Prava Status Flow

## Goal

Persist every merchant checkout, expose authenticated checkout history, synchronize Prava status safely, and return the user to chat after Prava approval.

## Status semantics

| Prava status | Checkout status | UI behavior |
| --- | --- | --- |
| `pending` | `awaiting_approval` | Keep approval modal open |
| `awaiting_result` | `approved` | Show approval success and return to chat |
| `completed` | `paid` | Show final payment success |
| `failed` | `failed` | Show failure and retry options |
| expired | `expired` | Allow a new payment session |

`awaiting_result` means Prava issued payment credentials and is waiting for the merchant result. It must not be represented as a captured payment.

## Backend

- Add a `checkouts` table containing an immutable item snapshot, merchant, totals, owner, provider references, lifecycle timestamps, and failure details.
- Keep `prava_payment_sessions` and `prava_transactions` as provider infrastructure records.
- Create one checkout per merchant payment session. Multi-merchant checkouts share a checkout group ID.
- Add authenticated history, detail, and status-sync endpoints.
- Persist normalized remote statuses whenever Prava is polled.
- Never return or store Prava card tokens, dynamic CVVs, or card expiry values in checkout history.
- Report `APPROVED` or `DECLINED` to Prava only after the merchant execution result is known.

## Frontend

- `PravaApproval.jsx` renders controls according to normalized checkout status.
- `Checkout.jsx` consumes backend checkout state instead of inferring payment state.
- On `approved`, close the approval modal, show a short "Payment approved" state, return to chat, and continue status synchronization independently of the modal.
- Remove cart items only after status becomes `paid`.
- Add a checkout-history canvas page using the existing design system.

## Backend API

- `GET /api/checkouts` lists the authenticated user's checkout history.
- `GET /api/checkouts/:checkoutId` returns checkout details.
- `POST /api/checkouts/:checkoutId/sync` fetches Prava status, sanitizes it, persists the normalized status, and returns the checkout.

