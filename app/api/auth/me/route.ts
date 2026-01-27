
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";

export async function GET() {
    try {
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            console.error("!!! WHOP AUTH ERROR: No userId found in token !!!");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await whop.users.retrieve(userId);

        // LOUD LOGGING FOR RENDER
        console.error("!!! SUCCESS: Authenticated Whop User:", user.id, "!!!");
        console.error("!!! RAW USER DATA:", JSON.stringify(user, null, 2), "!!!");

        // Extremely defensive mapping for profile picture
        const profilePicUrl =
            (user as any).profile_picture?.url ||
            (user as any).profile_pic_url ||
            (user as any).avatar_url ||
            (user as any).image_url;

        return NextResponse.json({
            id: user.id,
            username: user.username || user.name || "Creator",
            profile_pic_url: profilePicUrl,
        });
    } catch (error: any) {
        console.error("!!! CRITICAL WHOP AUTH ERROR:", error.message || error, "!!!");
        return NextResponse.json({ error: "Unauthorized", message: error.message }, { status: 401 });
    }
}
