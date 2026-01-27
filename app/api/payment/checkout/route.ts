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

        // Use Option 1 from the Whop docs: Create a plan to get a purchase_url
        // This is more robust for one-time links and avoids the 'configuration' errors
        const plan = await (whop.plans as any).create({
            company_id: companyId,
            initial_price: price,
            plan_type: "one_time",
            metadata: {
                user_id: userId,
                credits: credits.toString(),
                type: "credit_purchase"
            },
        });

        if (!plan.purchase_url) {
            throw new Error("Failed to generate purchase URL");
        }

        return NextResponse.json({ url: plan.purchase_url });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
