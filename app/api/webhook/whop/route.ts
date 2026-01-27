import { NextResponse } from "next/server";
import { whop } from "@/lib/whop";
import { db } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const body = await req.text();
        const signature = req.headers.get("x-whop-signature");

        if (!signature) {
            return NextResponse.json({ error: "No signature" }, { status: 400 });
        }

        // Verify and unwrap webhook
        // Note: The @whop/sdk might require the WHOP_WEBHOOK_SECRET environment variable
        const webhookData = whop.webhooks.unwrap(body, {
            headers: {
                "x-whop-signature": signature
            }
        });

        if (webhookData.type === "payment.succeeded") {
            const payment = webhookData.data;
            const metadata = payment.metadata || {};

            if (metadata.type === "credit_purchase" && metadata.user_id && metadata.credits) {
                const userId = metadata.user_id as string;
                const creditAmount = parseInt(metadata.credits as string);

                if (!isNaN(creditAmount)) {
                    // Update user credits in DB
                    await db.execute({
                        sql: "UPDATE users SET credits = credits + ? WHERE id = ?",
                        args: [creditAmount, userId]
                    });

                    console.log(`[Webhook] Fulfilled ${creditAmount} credits for user ${userId}`);
                }
            }
        }

        return new Response("OK", { status: 200 });
    } catch (error: any) {
        console.error("Webhook Error:", error);
        // Important: Return 200 even on error to avoid Whop retrying if it's a code issue, 
        // but 400/500 is better for debugging if we want retries.
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
