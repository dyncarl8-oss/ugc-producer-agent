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
        // Per Whop docs: company_id at top level, plan contains price and type
        const checkoutConfig = await (whop.checkoutConfigurations as any).create({
            company_id: companyId,
            plan: {
                initial_price: price,
                plan_type: "one_time",
            },
            metadata: {
                user_id: userId,
                credits: credits.toString(),
                type: "credit_purchase"
            },
        });

        if (!checkoutConfig.id) {
            throw new Error("Failed to generate checkout session");
        }

        // Return session ID for embedded checkout
        return NextResponse.json({ sessionId: checkoutConfig.id });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
