import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";
import Whop from "@whop/sdk";

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

        // Create Whop client with Company API Key
        const client = new Whop({
            apiKey: process.env.WHOP_API_KEY,
        });

        // Create checkout configuration
        // API Error explicitly demands: plan.companyId and plan.currency
        const checkoutConfig = await (client.checkoutConfigurations as any).create({
            plan: {
                companyId: process.env.WHOP_COMPANY_ID!,
                initialPrice: Number(price),
                planType: "one_time",
                currency: "usd",
            },
            metadata: {
                user_id: userId,
                credits: credits.toString(),
                type: "credit_purchase",
            },
        });

        console.log("Checkout config created:", checkoutConfig.id);

        return NextResponse.json({
            sessionId: checkoutConfig.id,
        });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
