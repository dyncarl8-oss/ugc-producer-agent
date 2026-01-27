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

        const inputCompanyId = bodyCompanyId || process.env.WHOP_COMPANY_ID || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID;

        // Create a checkout configuration (Option 2: Embedded checkout)
        // 1. Initialize a clean Whop client (no appID) to avoid context issues
        const { Whop } = await import("@whop/sdk");
        const client = new Whop({ apiKey: process.env.WHOP_API_KEY });

        // 2. [Pre-flight] Determine the correct company ID from the API key
        // This ensures we're using the right biz_ID regardless of what's in the DB/frontend
        let finalCompanyId = inputCompanyId;
        try {
            const company = await (client as any).companies.retrieve();
            if (company && company.id) {
                console.log("Confirmed Whop Company ID:", company.id);
                finalCompanyId = company.id;
            }
        } catch (e) {
            console.warn("Could not verify company ID via API, falling back to provided ID:", finalCompanyId);
        }

        // 3. Create the checkout configuration with the EXACT schema from @whop/sdk types
        // Note: For inline plans, company_id and currency are REQUIRED inside the plan object.
        const checkoutConfig = await (client.checkoutConfigurations as any).create({
            plan: {
                company_id: finalCompanyId,
                currency: "usd",
                initial_price: Number(price),
                plan_type: "one_time"
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

        // Return session ID for embedded checkout
        return NextResponse.json({ sessionId: checkoutConfig.id });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
