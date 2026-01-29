import { NextResponse } from "next/server";
import { whop } from "@/lib/whop";
import { db } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const { paymentId } = await req.json();

        if (!paymentId) {
            return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
        }

        console.log(`[Verify] Verifying payment: ${paymentId}`);

        // Retrieve payment details from Whop
        // Using the SDK to fetch payment status
        const payment = await whop.payments.retrieve({ id: paymentId });

        console.log(`[Verify] Payment Status: ${payment.status}`);

        if (payment.status === "paid" || payment.status === "completed") {
            const metadata = payment.metadata || {};
            const userId = metadata.userId || metadata.user_id;
            const creditsToAdd = parseInt(String(metadata.credits || "0"));

            console.log(`[Verify] Metadata - UserID: ${userId}, Credits: ${creditsToAdd}`);

            if (userId && creditsToAdd > 0) {
                // Update user credits
                console.log(`[Verify] Adding ${creditsToAdd} credits to user ${userId}`);

                await db.execute({
                    sql: "UPDATE users SET credits = credits + ? WHERE id = ?",
                    args: [creditsToAdd, String(userId)]
                });

                return NextResponse.json({ success: true, credits: creditsToAdd });
            } else {
                console.error("[Verify] Missing metadata in paid payment");
                return NextResponse.json({ error: "Invalid payment metadata" }, { status: 400 });
            }
        } else {
            return NextResponse.json({ error: `Payment not paid (Status: ${payment.status})` }, { status: 400 });
        }

    } catch (error: any) {
        console.error("[Verify] Error verifying payment:", error);
        return NextResponse.json({ error: error.message || "Verification failed" }, { status: 500 });
    }
}
