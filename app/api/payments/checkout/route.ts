import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";

const PACKAGES = {
    pack_3: { credits: 3, price: 6.0 },
    pack_5: { credits: 5, price: 10.0 },
    pack_12: { credits: 12, price: 20.0 },
    pack_18: { credits: 18, price: 30.0 },
};

export async function POST(req: Request) {
    try {
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { packageId } = await req.json();
        const pkg = PACKAGES[packageId as keyof typeof PACKAGES];

        if (!pkg) {
            return NextResponse.json({ error: "Invalid package ID" }, { status: 400 });
        }

        const checkoutConfig = await whop.checkoutConfigurations.create({
            company_id: process.env.WHOP_COMPANY_ID!,
            plan: {
                company_id: process.env.WHOP_COMPANY_ID!,
                initial_price: pkg.price,
                plan_type: "one_time",
                currency: "usd",
            },
            metadata: {
                user_id: userId,
                package_id: packageId,
                credits: pkg.credits,
            },
        });

        return NextResponse.json({ sessionId: checkoutConfig.id });
    } catch (error: any) {
        console.error("Checkout Error:", error);
        return NextResponse.json({ error: error.message || "Failed to create checkout session" }, { status: 500 });
    }
}
