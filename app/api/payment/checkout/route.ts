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
        const companyId = bodyCompanyId || process.env.WHOP_COMPANY_ID || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

        if (!companyId) {
            console.error("!!! EB: Missing companyId. Checked body and ENV !!!");
            return NextResponse.json({ error: "No Company ID found. Please add WHOP_COMPANY_ID to your environment variables." }, { status: 400 });
        }

        if (!credits || !price) {
            return NextResponse.json({ error: "Missing required fields: credits, price" }, { status: 400 });
        }

        // Create a checkout configuration (Option 2: Embedded checkout)
        // We use direct fetch to have full control over the payload and bypass SDK mapping issues
        const response = await fetch("https://data.whop.com/api/v1/checkout_configurations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.WHOP_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                company_id: companyId,
                plan: {
                    initial_price: price,
                    plan_type: "one_time",
                    currency: "usd"
                },
                metadata: {
                    user_id: userId,
                    credits: credits.toString(),
                    type: "credit_purchase"
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Whop API Error Details:", JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || data.message || "Failed to generate checkout session");
        }

        const checkoutConfig = data;

        if (!checkoutConfig.id) {
            throw new Error("Failed to generate checkout session (No ID returned)");
        }

        // Return session ID for embedded checkout
        return NextResponse.json({ sessionId: checkoutConfig.id });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
