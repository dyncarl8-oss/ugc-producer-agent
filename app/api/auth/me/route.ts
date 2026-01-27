
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

        const user = await whop.users.retrieve({ id: userId });

        return NextResponse.json({
            id: user.id,
            username: user.username,
            profile_pic_url: user.profile_pic_url,
        });
    } catch (error: any) {
        console.error("Whop Auth Error:", error);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
}
