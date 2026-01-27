import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";

export async function POST(req: Request) {
    try {
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { credits, price, companyId } = await req.json();

        if (!credits || !price || !companyId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Create a checkout configuration
        // We use metadata to store the userId and credit amount for the webhook to fulfill
        const checkoutConfig = await whop.checkoutConfigurations.create({
            company_id: companyId,
            plan: {
                initial_price: price,
                plan_type: "one_time",
                billing_period: 0, // 0 for one-time
                company_id: companyId,
                currency: "usd",
            },
            metadata: {
                user_id: userId,
                credits: credits.toString(),
                type: "credit_purchase"
            },
        });

        // The SDK returns the config, we need to construct the purchase URL
        // Typically it's whop.com/checkout/config_id
        const purchaseUrl = `https://whop.com/checkout/${checkoutConfig.id}`;

        return NextResponse.json({ url: purchaseUrl });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
