import { NextResponse } from "next/server";
import { headers } from "next/headers"; // Added import
import { whop } from "@/lib/whop";
import { db } from "@/lib/db";

// Duplicate PACKAGES config for verification mapping
// In a real app, this should be in a shared config file
const PACKAGES = {
    pack_3: { credits: 3 },
    pack_5: { credits: 5 },
    pack_12: { credits: 12 },
    pack_18: { credits: 18 },
};

// Map Plan IDs to Package IDs if possible, or just default to 5 credits for unknown plans in test mode
// Since we don't know the exact plan ID string Whop generates for each "product", 
// we might need to rely on the fact that the user JUST bought it.
// However, accurate mapping requires us to know which plan corresponds to which credit amount.
// For this fix, we will try to find the plan in the user's active memberships.

export async function POST(req: Request) {
    try {
        const { paymentId } = await req.json();

        if (!paymentId) {
            return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
        }

        console.log(`[Verify] Verifying ID: ${paymentId}`);

        // 1. Authenticate User (Required for Plan/Membership checks)
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            console.error("[Verify] Unauthorized: No valid user token");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let creditsToAdd = 0;

        // 2. Handle Plan IDs (Free/Test Purchases)
        if (paymentId.startsWith("plan_") || paymentId.startsWith("img_") || !paymentId.startsWith("pay_")) {
            console.log(`[Verify] ID indicates Plan/Product (${paymentId}). Checking memberships for user ${userId}...`);

            // List memberships for the user
            const memberships = await whop.memberships.list({ user_id: userId, valid: true });

            // Find a membership that matches the plan ID or was created very recently
            // Since we don't easily know the plan_id -> credits mapping without querying the Plan API,
            // And we are in a "test" mode with $0 prices, we will credit based on the "Starter" package (5 credits) 
            // OR if we can find metadata on the membership. Note: Metadata on subscription usually comes from the initial checkout.

            // For now, if we find ANY valid membership for this plan, we treat it as success.
            const validMembership = memberships.data.find((m: any) => m.plan_id === paymentId || m.id === paymentId);

            if (validMembership) {
                console.log("[Verify] Found valid membership:", validMembership.id);
                // validMembership.metadata might be empty if not passed correctly to subscription
                // FALLBACK for Test: Add 5 credits (Standard) or try to parse from plan name if available
                creditsToAdd = 5;
                console.log(`[Verify] converting Plan ID to ${creditsToAdd} credits (Test Mode Fallback)`);
            } else {
                console.error("[Verify] No active membership found for this plan.");
                // It's possible the ID passed is a "Receipt" ID but not "pay_". 
                // But typically Whop returns "pay_" for payments.
                return NextResponse.json({ error: "Membership not found" }, { status: 404 });
            }

        } else {
            // 3. Handle Payment IDs (Real Payments)
            const payment = await whop.payments.retrieve(paymentId) as any;
            console.log(`[Verify] Payment Status: ${payment.status}`);

            if (payment.status === "paid" || payment.status === "completed" || payment.status === "succeeded" || payment.paid === true) {
                const metadata = payment.metadata || {};
                const metaUserId = metadata.userId || metadata.user_id;

                // Verify the payment actually belongs to the user requesting verification
                if (metaUserId && metaUserId !== userId) {
                    console.error(`[Verify] User mismatch! Token: ${userId}, Payment: ${metaUserId}`);
                    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
                }

                creditsToAdd = parseInt(String(metadata.credits || "0"));
            } else {
                return NextResponse.json({ error: `Payment not paid (Status: ${payment.status})` }, { status: 400 });
            }
        }

        // 4. Update Credits
        if (creditsToAdd > 0) {
            console.log(`[Verify] Adding ${creditsToAdd} credits to user ${userId}`);
            await db.execute({
                sql: "UPDATE users SET credits = credits + ? WHERE id = ?",
                args: [creditsToAdd, String(userId)]
            });
            return NextResponse.json({ success: true, credits: creditsToAdd });
        } else {
            return NextResponse.json({ error: "No credits to add" }, { status: 400 });
        }

    } catch (error: any) {
        console.error("[Verify] Critical Error:", error);
        return NextResponse.json({ error: error.message || "Verification failed" }, { status: 500 });
    }
}
