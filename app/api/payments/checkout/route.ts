// Forces a clean redeploy after syntax error fix
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";

const PACKAGES = {
    // TODO: Revert prices to real values after testing
    pack_3: { credits: 3, price: 0.0 }, // Was 6.0
    pack_5: { credits: 5, price: 0.0 }, // Was 10.0
    pack_12: { credits: 12, price: 0.0 }, // Was 20.0
    pack_18: { credits: 18, price: 0.0 }, // Was 30.0
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
            // Use Whop SDK to create checkout configuration (Option 2)
            // Following exact guide: https://docs.whop.com/developer/guides/accept-payments#step-1:-create-a-checkout-configuration
            const checkoutConfig = await whop.checkoutConfigurations.create({
                plan: {
                    company_id: process.env.WHOP_COMPANY_ID || "",
                    initial_price: pkg.price,
                    plan_type: "one_time",
                    currency: "usd",
                },
                metadata: {
                    userId: userId,
                    packageId: packageId,
                    credits: String(pkg.credits),
                },
            });

            console.log("Whop Checkout Config Created Successfully:", checkoutConfig.id);
            return NextResponse.json({
                sessionId: checkoutConfig.id,
                purchaseUrl: (checkoutConfig as any).purchase_url
            });
        } catch (sdkError: any) {
            console.error("SDK Execution Error:", sdkError);
            throw sdkError;
        }
    } catch (error: any) {
        console.error("Checkout Route Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to create checkout session"
        }, { status: 500 });
    }
}
