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
        const companyId = process.env.WHOP_COMPANY_ID;

        if (!paymentId || !packageId) {
            return NextResponse.json({ error: "Missing information" }, { status: 400 });
        }

        console.log(`[Verify] START: ID=${paymentId}, Pkg=${packageId}, CompanyID=${companyId}`);

        // 1. Get current logged in user
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            console.error("[Verify] Auth failed: No userId in token");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Determine credits to add
        const pkg = PACKAGES[packageId as keyof typeof PACKAGES];
        const creditsToAdd = pkg ? pkg.credits : 0;

        if (creditsToAdd === 0) {
            return NextResponse.json({ error: "Invalid package" }, { status: 400 });
        }

        // 3. Robust Verification Check
        let isValid = false;

        try {
            if (paymentId.startsWith("pay_")) {
                const payment = await whop.payments.retrieve(paymentId) as any;
                isValid = (payment.status === "paid" || payment.paid === true);
            } else {
                // If it's a plan_ or membership_, we check memberships
                console.log(`[Verify] Validating ID: ${paymentId} for User: ${userId}`);

                // Method A: Use user's own token (Acts as the user)
                const userToken = head.get('authorization');
                if (userToken) {
                    try {
                        console.log("[Verify] Fetching user profile/memberships via user token...");
                        const response = await fetch('https://api.whop.com/v1/user/memberships', {
                            headers: { 'Authorization': userToken }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            const memberships = Array.isArray(data) ? data : (data.data || []);

                            isValid = memberships.some((m: any) =>
                                m.id === paymentId ||
                                m.plan_id === paymentId ||
                                m.plan?.id === paymentId ||
                                m.checkout_session_id === paymentId
                            );

                            if (isValid) console.log("[Verify] SUCCESS via user token match.");
                        } else {
                            console.warn("[Verify] User token API check returned status:", response.status);
                        }
                    } catch (tokenErr: any) {
                        console.error("[Verify] User token check error:", tokenErr.message);
                    }
                }

                // Method B: Fallback to Server SDK
                if (!isValid) {
                    try {
                        const memberships = await whop.memberships.list({
                            user_ids: [userId],
                            company_id: companyId
                        });
                        isValid = memberships.data.some((m: any) =>
                            m.id === paymentId || m.plan_id === paymentId
                        );
                        if (isValid) console.log("[Verify] SUCCESS via SDK fallback.");
                    } catch (sdkError: any) {
                        console.error("[Verify] SDK fallback check also failed:", sdkError.message);
                    }
                }
            }
        } catch (e: any) {
            console.error("[Verify] Main verification loop failed:", e.message);
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
            console.error("[Verify] FINAL FAILURE: Could not verify transaction.");
            return NextResponse.json({ error: "Could not verify transaction" }, { status: 400 });
        }

    } catch (error: any) {
        console.error("[Verify] CRITICAL ERROR:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
