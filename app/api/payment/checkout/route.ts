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



        const { Whop } = await import("@whop/sdk");
        const client = new Whop({ apiKey: process.env.WHOP_API_KEY });

        // Create checkout configuration (Option 2: Embedded checkout)
        // As per Whop docs: company_id goes at TOP LEVEL, plan contains price/type
        const checkoutConfig = await (client.checkoutConfigurations as any).create({
            company_id: companyId,
            plan: {
                initial_price: Number(price),
                plan_type: "one_time",
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
