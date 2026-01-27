
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { whop } from "@/lib/whop";
import { db, initDb } from "@/lib/db";

export async function GET() {
    try {
        // Auto-initialize DB if needed
        await initDb();

        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            console.error("!!! WHOP AUTH ERROR: No userId found in token !!!");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await whop.users.retrieve(userId);

        // Defensive mapping for profile picture
        const profilePicUrl =
            (user as any).profile_picture?.url ||
            (user as any).profile_pic_url ||
            (user as any).avatar_url ||
            (user as any).image_url;

        // DB SYNC & UPSERT
        const username = user.username || user.name || "Creator";

        // Check if user exists
        const existingUser = await db.execute({
            sql: "SELECT credits FROM users WHERE id = ?",
            args: [userId]
        });

        let credits = 1;

        if (existingUser.rows.length === 0) {
            // New user, insert with 1 free credit
            await db.execute({
                sql: "INSERT INTO users (id, username, profile_pic_url, credits) VALUES (?, ?, ?, 1)",
                args: [userId, username, profilePicUrl]
            });
            console.error(`!!! DB: Created new user ${userId} with 1 free credit !!!`);
        } else {
            // Existing user, update profile info (but keep credits)
            await db.execute({
                sql: "UPDATE users SET username = ?, profile_pic_url = ? WHERE id = ?",
                args: [username, profilePicUrl, userId]
            });
            credits = existingUser.rows[0].credits as number;
        }

        return NextResponse.json({
            id: user.id,
            username: username,
            profile_pic_url: profilePicUrl,
            credits: credits
        });
    } catch (error: any) {
        console.error("!!! CRITICAL WHOP AUTH ERROR:", error.message || error, "!!!");
        return NextResponse.json({ error: "Unauthorized", message: error.message }, { status: 401 });
    }
}
