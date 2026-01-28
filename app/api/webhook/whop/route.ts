import { NextResponse } from "next/server";
import { whop } from "@/lib/whop";
import { db } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const bodyText = await req.text();
        // Convert headers to a plain object for the SDK
        const headerMap: Record<string, string> = {};
        req.headers.forEach((value, key) => {
            headerMap[key] = value;
        });

        // Verify and unwrap the webhook payload
        const webhookData = whop.webhooks.unwrap(bodyText, { headers: headerMap });

        if (webhookData.type === "payment.succeeded") {
            const payment = webhookData.data;
            const metadata = payment.metadata || {};
            const userId = metadata.userId || metadata.user_id; // Check both casing conventions 
            const creditsToAdd = parseInt(String(metadata.credits || "0"));

            if (userId && creditsToAdd > 0) {
                console.log(`[Webhook] Updating credits for user ${userId}: +${creditsToAdd}`);

                await db.execute({
                    sql: "UPDATE users SET credits = credits + ? WHERE id = ?",
                    args: [creditsToAdd, String(userId)]
                });
            } else {
                console.warn("[Webhook] Payment succeeded but missing userId or credits metadata", metadata);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Webhook Error:", error);
        // Return 200 even on error to prevent Whop from retrying if it's a semantic error, 
        // but 500 if it's a server error might be appropriate. 
        // For signature verification failure, it throws.
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
