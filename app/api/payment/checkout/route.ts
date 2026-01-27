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

        const { credits, price } = await req.json();

        if (!credits || !price) {
            return NextResponse.json({ error: "Missing required fields: credits, price" }, { status: 400 });
        }

        const companyId = process.env.WHOP_COMPANY_ID || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

        // Create a checkout configuration (Option 2: Embedded checkout)
        // Since we are using a Company API Key, providing company_id at the top level 
        // often triggers "Cannot provide company_id for this configuration".
        // However, the nested plan object STILL needs it to know which context to create the plan in.

        const { Whop } = await import("@whop/sdk");
        const client = new Whop({ apiKey: process.env.WHOP_API_KEY });

        const checkoutConfig = await (client.checkoutConfigurations as any).create({
            plan: {
                company_id: companyId,
                title: `${credits} Credits Purchase`,
                initial_price: Number(price),
                plan_type: "one_time",
                currency: "usd"
            },
            metadata: {
                user_id: userId,
                credits: credits.toString(),
                type: "credit_purchase"
            },
        });

        if (!checkoutConfig.id) {
            throw new Error("Failed to generate checkout session (No ID returned)");
        }

        console.log("Whop Checkout Configuration created successfully:", checkoutConfig.id);
        console.log("Checkout URL:", checkoutConfig.purchase_url);

        // Return session ID and full purchase URL
        return NextResponse.json({
            sessionId: checkoutConfig.id,
            url: checkoutConfig.purchase_url
        });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
