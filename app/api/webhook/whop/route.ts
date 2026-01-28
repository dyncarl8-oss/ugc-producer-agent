import { NextResponse } from "next/server";
import { whop } from "@/lib/whop";
import { db } from "@/lib/db";

export async function POST(req: Request) {
    try {
        console.log("--- WHOP WEBHOOK RECEIVED ---");
        const bodyText = await req.text();
        console.log(`Webhook Body Length: ${bodyText.length}`);

        // Convert headers to a plain object for the SDK
        const headerMap: Record<string, string> = {};
        req.headers.forEach((value, key) => {
            headerMap[key] = value;
        });
        console.log("Webhook Headers:", JSON.stringify(headerMap, null, 2));

        // Verify and unwrap the webhook payload
        let webhookData;
        try {
            webhookData = whop.webhooks.unwrap(bodyText, { headers: headerMap });
            console.log("Webhook Signature Verification: SUCCESS");
            console.log("Webhook Type:", webhookData.type);
        } catch (unwrapError: any) {
            console.error("Webhook Signature Verification FAILED:", unwrapError.message);
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        if (webhookData.type === "payment.succeeded") {
            const payment = webhookData.data;
            console.log("Payment Succeeded Data:", JSON.stringify(payment, null, 2));

            const metadata = payment.metadata || {};
            const userId = metadata.userId || metadata.user_id;
            const creditsToAdd = parseInt(String(metadata.credits || "0"));

            console.log(`Extracted Metadata - UserID: ${userId}, Credits: ${creditsToAdd}`);

            if (userId && creditsToAdd > 0) {
                console.log(`[Webhook] Updating credits for user ${userId}: +${creditsToAdd}`);

                const result = await db.execute({
                    sql: "UPDATE users SET credits = credits + ? WHERE id = ?",
                    args: [creditsToAdd, String(userId)]
                });
                console.log("DB Update Result:", JSON.stringify(result, null, 2));
            } else {
                console.warn("[Webhook] Payment succeeded but missing userId or credits metadata", metadata);
            }
        } else {
            console.log("Ignoring webhook event type:", webhookData.type);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Webhook Critical Error:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
