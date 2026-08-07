import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate, PLANS, type PlanName } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const merchant = await prisma.merchant.findUnique({ where: { shop } });
  const isActive = merchant?.subscriptionStatus === "active";

  return {
    shop,
    currentPlan: isActive ? merchant?.plan ?? "none" : "none",
    subscriptionStatus: merchant?.subscriptionStatus ?? "inactive",
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
  await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as PlanName;

  if (!plan || !Object.values(PLANS).includes(plan)) {
    return { ok: false, message: "Invalid plan" };
  }

  return {
    ok: false,
    message: `${plan} is not available yet. The app is currently free with a 50-product catalogue limit.`,
  };
};

export default function Billing() {
  const { currentPlan, subscriptionStatus, plans, shop } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Billing &amp; Subscription">
      {currentPlan === "none" && (
        <s-section>
          <s-paragraph>
            The free catalogue preview keeps up to 50 products discoverable.
          </s-paragraph>
          <s-paragraph>
            Paid plans are coming soon. Your store is currently using the free
            catalogue preview.
          </s-paragraph>
        </s-section>
      )}

      <s-section heading="Current plan" slot="aside">
        <s-paragraph>
          <s-text>Plan: </s-text>
          <s-text>
            {currentPlan === "none" ? "Free plan" : currentPlan}
          </s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Status: </s-text>
          <s-badge
            tone={subscriptionStatus === "active" ? "success" : "caution"}
          >
            {subscriptionStatus === "active" ? "Active" : "Free"}
          </s-badge>
        </s-paragraph>
        <s-paragraph>
          <s-text>Store: {shop}</s-text>
        </s-paragraph>
      </s-section>

      <s-section heading="Support &amp; help" slot="aside">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/support" target="_blank">
              Documentation
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/support" target="_blank">
              Contact support
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/terms" target="_blank">
              Pricing page
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>

      {plans.map((plan) => {
        const isActive = currentPlan === plan.name;

        return (
          <s-section key={plan.name} heading={plan.name}>
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text>
                  ${plan.price}/month - {plan.description}
                </s-text>
              </s-paragraph>

              <s-unordered-list>
                {plan.features.map((feature) => (
                  <s-list-item key={feature}>{feature}</s-list-item>
                ))}
              </s-unordered-list>

              {isActive ? (
                <s-badge tone="success">Current plan</s-badge>
              ) : (
                <s-button disabled variant="secondary">
                  Paid plan coming soon
                </s-button>
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
