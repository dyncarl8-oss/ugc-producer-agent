
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";

export async function GET() {
    try {
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await whop.users.retrieve(userId);

        // Defensive mapping for profile picture URL
        const profilePicUrl = (user as any).profile_picture?.url || (user as any).profile_pic_url;

        return NextResponse.json({
            id: user.id,
            username: user.username,
            profile_pic_url: profilePicUrl,
        });
    } catch (error: any) {
        console.error("Whop Auth Error:", error);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
}
