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

        if (!credits || !price) {
            return NextResponse.json({ error: "Missing required fields: credits, price" }, { status: 400 });
        }

        const companyId = bodyCompanyId || process.env.WHOP_COMPANY_ID || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

        if (!companyId) {
            return NextResponse.json({ error: "No Company ID found. Please add WHOP_COMPANY_ID to your environment variables." }, { status: 400 });
        }

        // Create a checkout configuration (Option 2: Embedded checkout)
        // We use direct REST API to avoid SDK mapping issues
        // Doc link: https://docs.whop.com/developer/guides/accept-payments#step-1:-create-a-checkout-configuration
        const payload = {
            company_id: companyId,
            plan: {
                company_id: companyId, // Double-provide to satisfy nested requirements if mandatory
                title: "Credits Purchase",
                initial_price: Number(price),
                plan_type: "one_time",
                currency: "usd"
            },
            metadata: {
                user_id: userId,
                credits: credits.toString(),
                type: "credit_purchase"
            },
        };

        console.log("Creating Whop Checkout Configuration with payload:", JSON.stringify(payload, null, 2));

        const response = await fetch("https://api.whop.com/api/v1/checkout_configurations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.WHOP_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Whop API Error Response:", JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || data.message || "Failed to generate checkout session");
        }

        console.log("Whop Checkout Configuration created successfully:", data.id);

        // Return session ID for embedded checkout
        return NextResponse.json({ sessionId: data.id });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
