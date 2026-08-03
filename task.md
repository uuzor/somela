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

# Virtual Try-On Experience

## Goal

Turn product selection and YouCam generation into one fluid fitting-room workflow without changing unrelated commerce UI.

## Fitting dock

- Treat the selected-product tray as a fitting dock for one to five garments.
- Show selected garment thumbnails, count, combined price, remove, and clear controls.
- Use `Try on` for one garment and `Try as outfit` for multiple garments.
- Detect incompatible garment combinations before generation and explain the conflict.
- Keep comparison separate from try-on and show active generation progress in the dock.

## Studio phases

- `Prepare`: show selfie guidance, preview the chosen photo, and require confirmation before upload.
- `Generate`: show the real selfie, selected garment stack, persisted stage, and garment step progress.
- `Review`: support result, original, and side-by-side views with save, cart, retry, and download actions.
- Replace the non-interactive queue with selectable recent looks and exclude the active look.

## State model

- Normalize jobs around `id`, `productIds`, `products`, `selfie`, `status`, `stage`, `currentStep`, `totalSteps`, `currentProductId`, `resultImageUrl`, `errorMessage`, and timestamps.
- Persist job stage and progress in `tryon_tasks`.
- Add authenticated try-on history so completed looks survive page reloads.
- Prevent duplicate active jobs for the same ordered garment set.

## Delivery stages

1. Add backend progress fields and history API.
2. Add fitting-dock multi-selection behavior.
3. Implement prepare, generate, and review studio states.
4. Add recent-look selection, responsive behavior, and accessibility checks.
