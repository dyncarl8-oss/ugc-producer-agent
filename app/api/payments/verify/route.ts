import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";
import { db } from "@/lib/db";

const PACKAGES = {
    pack_3: { credits: 3 },
    pack_5: { credits: 5 },
    pack_12: { credits: 12 },
    pack_18: { credits: 18 },
};

export async function POST(req: Request) {
    try {
        const { paymentId, packageId } = await req.json();

        if (!paymentId || !packageId) {
            return NextResponse.json({ error: "Missing information" }, { status: 400 });
        }

        console.log(`[Verify] Verifying: ${paymentId} for ${packageId}`);

        // 1. Get current logged in user
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Determine credits to add
        const pkg = PACKAGES[packageId as keyof typeof PACKAGES];
        const creditsToAdd = pkg ? pkg.credits : 0;

        if (creditsToAdd === 0) {
            return NextResponse.json({ error: "Invalid package" }, { status: 400 });
        }

        // 3. Simple Verification Check
        let isValid = false;

        try {
            if (paymentId.startsWith("pay_")) {
                const payment = await whop.payments.retrieve(paymentId) as any;
                isValid = (payment.status === "paid" || payment.paid === true);
            } else {
                // If it's a plan_ or membership_, check active memberships
                const memberships = await whop.memberships.list({ user_ids: [userId] });
                isValid = memberships.data.some((m: any) => m.id === paymentId || m.plan_id === paymentId);
            }
        } catch (e) {
            console.error("[Verify] Whop API Check failed, using fallback:", e);
            // Fallback for tricky IDs: Check if user has ANY active membership
            const memberships = await whop.memberships.list({ user_ids: [userId] });
            isValid = memberships.data.length > 0;
        }

        // 4. Update Database
        if (isValid) {
            console.log(`[Verify] SUCCESS. Adding ${creditsToAdd} credits to ${userId}`);
            await db.execute({
                sql: "UPDATE users SET credits = credits + ? WHERE id = ?",
                args: [creditsToAdd, String(userId)]
            });
            return NextResponse.json({ success: true, credits: creditsToAdd });
        } else {
            return NextResponse.json({ error: "Could not verify transaction" }, { status: 400 });
        }

    } catch (error: any) {
        console.error("[Verify] Critical Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
