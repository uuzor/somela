import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate, PLANS, type PlanName } from "../shopify.server";
import prisma from "../db.server";

const billingTestMode = process.env.SHOPIFY_BILLING_TEST === "true";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Check current billing status
  let currentPlan: string = "none";
  let subscriptionStatus = "inactive";

  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PLANS.STARTER, PLANS.GROWTH, PLANS.PRO],
      isTest: billingTestMode,
    });

    if (hasActivePayment && appSubscriptions.length > 0) {
      const sub = appSubscriptions[0];
      currentPlan = sub.name;
      subscriptionStatus = "active";

      // Keep local merchant record in sync
      await prisma.merchant.update({
        where: { shop },
        data: {
          plan: sub.name,
          subscriptionStatus: "active",
          subscriptionId: sub.id,
        },
      });
    } else {
      // No active subscription — reset local record if needed
      const merchant = await prisma.merchant.findUnique({ where: { shop } });
      if (merchant?.subscriptionStatus === "active") {
        await prisma.merchant.update({
          where: { shop },
          data: { plan: "none", subscriptionStatus: "inactive" },
        });
      }
    }
  } catch {
    // billing.check may throw if no plans are configured / in dev mode
    const merchant = await prisma.merchant.findUnique({ where: { shop } });
    currentPlan = merchant?.plan ?? "none";
    subscriptionStatus = merchant?.subscriptionStatus ?? "inactive";
  }

  return {
    shop,
    currentPlan,
    subscriptionStatus,
    plans: [
      {
        name: PLANS.STARTER,
        price: 19,
        description: "Up to 500 products",
        features: [
          "500 indexed products",
          "Automatic webhook sync",
          "Manual resync",
          "Standard support",
        ],
      },
      {
        name: PLANS.GROWTH,
        price: 49,
        description: "Up to 5,000 products",
        features: [
          "5,000 indexed products",
          "Automatic webhook sync",
          "Manual resync",
          "Priority support",
          "Sync analytics",
        ],
      },
      {
        name: PLANS.PRO,
        price: 149,
        description: "Unlimited products",
        features: [
          "Unlimited indexed products",
          "Automatic webhook sync",
          "Bulk resync",
          "Dedicated support",
          "Sync analytics",
          "Early access to V2 features",
        ],
      },
    ],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  const formData = await request.formData();
  const plan = formData.get("plan") as PlanName;

  if (!plan || !Object.values(PLANS).includes(plan)) {
    return { ok: false, message: "Invalid plan" };
  }

  // Redirect to Shopify's billing confirmation page
  await billing.request({
    plan,
    isTest: billingTestMode,
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
  });

  // billing.request throws a redirect, so this line is never reached
  return null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Billing() {
  const { currentPlan, subscriptionStatus, plans, shop } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const requestingPlan = fetcher.formData?.get("plan") as string | null;

  return (
    <s-page heading="Billing &amp; Subscription">
      {currentPlan === "none" && (
        <s-section>
          <s-paragraph>
            The free catalogue preview keeps up to 50 products discoverable.
            Choose a paid plan to index a larger catalogue.
          </s-paragraph>
        </s-section>
      )}
      {/* Current plan summary */}
      <s-section heading="Current plan" slot="aside">
        <s-paragraph>
          <s-text>Plan: </s-text>
          <s-text>
            {currentPlan === "none" ? "No active plan" : currentPlan}
          </s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Status: </s-text>
          <s-badge
            tone={subscriptionStatus === "active" ? "success" : "caution"}
          >
            {subscriptionStatus === "active" ? "Active" : "Inactive"}
          </s-badge>
        </s-paragraph>
        <s-paragraph>
          <s-text>Store: {shop}</s-text>
        </s-paragraph>
      </s-section>

      <s-section heading="Support &amp; help" slot="aside">
        <s-unordered-list>
          <s-list-item>
            <s-link href="https://goatsight.com/docs" target="_blank">
              Documentation
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="https://goatsight.com/support" target="_blank">
              Contact support
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="https://goatsight.com/pricing" target="_blank">
              Pricing page
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>

      {/* Plan cards */}
      {plans.map((plan) => {
        const isActive = currentPlan === plan.name;
        const isLoading = requestingPlan === plan.name && fetcher.state !== "idle";

        return (
          <s-section key={plan.name} heading={plan.name}>
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  ${plan.price}/month — {plan.description}
                </s-text>
              </s-paragraph>

              <s-unordered-list>
                {plan.features.map((f) => (
                  <s-list-item key={f}>{f}</s-list-item>
                ))}
              </s-unordered-list>

              {isActive ? (
                <s-badge tone="success">Current plan</s-badge>
              ) : (
                <fetcher.Form method="post">
                  <input type="hidden" name="plan" value={plan.name} />
                  <s-button
                    variant="primary"
                    type="submit"
                    {...(isLoading ? { loading: true } : {})}
                  >
                    {currentPlan === "none" ? "Subscribe" : "Switch to this plan"}
                  </s-button>
                </fetcher.Form>
              )}
            </s-stack>
          </s-section>
        );
      })}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
