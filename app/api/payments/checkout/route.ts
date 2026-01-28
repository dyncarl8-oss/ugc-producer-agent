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
        console.log("--- CALLING CHECKOUT API ---");
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);
        console.log("Whop User Verification:", userId ? `SUCCESS (${userId})` : "FAILED");

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { packageId } = await req.json();
        console.log("Package ID requested:", packageId);
        const pkg = PACKAGES[packageId as keyof typeof PACKAGES];

        if (!pkg) {
            console.error("INVALID PACKAGE ID:", packageId);
            return NextResponse.json({ error: "Invalid package ID" }, { status: 400 });
        }

        console.log("Creating checkout config for package:", pkg);
        try {
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

            console.log("Whop Checkout Config Created Successfully:", checkoutConfig.id);
            return NextResponse.json({ sessionId: checkoutConfig.id });
        } catch (apiError: any) {
            console.error("--- WHOP API ERROR ---");
            console.error("Status:", apiError.status);
            console.error("Details:", JSON.stringify(apiError.data || apiError, null, 2));
            throw apiError;
        }
    } catch (error: any) {
        console.error("Checkout Route Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to create checkout session",
            details: error.data || null
        }, { status: 500 });
    }
}
