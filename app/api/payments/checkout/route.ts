// Forces a clean redeploy after syntax error fix
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
            // Reverting to SDK but following the EXACT structure in the provided doc snippet
            // Added company_id and currency back to plan as required by latest 400 error
            const checkoutConfig = await whop.checkoutConfigurations.create({
                company_id: process.env.WHOP_COMPANY_ID!,
                plan: {
                    company_id: process.env.WHOP_COMPANY_ID!,
                    companyId: process.env.WHOP_COMPANY_ID!,
                    initial_price: pkg.price,
                    initialPrice: pkg.price,
                    plan_type: "one_time",
                    planType: "one_time",
                    currency: "usd",
                } as any,
                metadata: {
                    userId: userId,
                    packageId: packageId,
                    credits: pkg.credits,
                },
            } as any);

            console.log("Whop Checkout Config Created Successfully:", checkoutConfig.id);
            return NextResponse.json({ sessionId: checkoutConfig.id });
        } catch (sdkError: any) {
            console.error("--- WHOP SDK ERROR ---");
            console.error("Status:", sdkError.status);
            console.error("Message:", sdkError.message);
            console.error("Details:", JSON.stringify(sdkError.data || sdkError, null, 2));

            return NextResponse.json({
                error: "Whop SDK Error",
                message: sdkError.message,
                details: sdkError.data || null
            }, { status: sdkError.status || 500 });
        }
    } catch (error: any) {
        console.error("Checkout Route Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to create checkout session"
        }, { status: 500 });
    }
}
