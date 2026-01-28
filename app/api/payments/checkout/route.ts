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

        console.log("Creating checkout config for package (v1):", pkg);

        try {
            // Switching to v1 as suggested by Whop support
            const response = await fetch("https://api.whop.com/api/v1/checkout_configurations", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.WHOP_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    company_id: process.env.WHOP_COMPANY_ID,
                    plan: {
                        initial_price: pkg.price,
                        plan_type: "one_time",
                        currency: "usd",
                    },
                    metadata: {
                        userId: userId,
                        packageId: packageId,
                        credits: pkg.credits,
                    },
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("--- WHOP API ERROR (v1 Fetch) ---");
                console.error("Status:", response.status);
                console.error("Details:", JSON.stringify(data, null, 2));
                return NextResponse.json({
                    error: "Whop API v1 Error",
                    details: data
                }, { status: response.status });
            }

            console.log("Whop Checkout Config Created Successfully (v1):", data.id);
            return NextResponse.json({ sessionId: data.id });
        } catch (fetchError: any) {
            console.error("Fetch Execution Error (v1):", fetchError);
            throw fetchError;
        }
    } catch (error: any) {
        console.error("Checkout Route Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to create checkout session"
        }, { status: 500 });
    }
}
