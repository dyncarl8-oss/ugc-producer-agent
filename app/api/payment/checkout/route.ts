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

        const { credits, price, companyId: bodyCompanyId } = await req.json();
        const companyId = bodyCompanyId || process.env.WHOP_COMPANY_ID;

        if (!credits || !price || !companyId) {
            return NextResponse.json({ error: "Missing required fields: credits, price, or companyId" }, { status: 400 });
        }

        // Create a checkout configuration
        // We use metadata to store the userId and credit amount for the webhook to fulfill
        const checkoutConfig = await whop.checkoutConfigurations.create({
            company_id: companyId,
            mode: "payment",
            plan: {
                initial_price: price,
                plan_type: "one_time",
            } as any,
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
