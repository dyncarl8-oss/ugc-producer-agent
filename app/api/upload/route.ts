import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const assetId = uuidv4();

        // Store in Turso
        await db.execute({
            sql: "INSERT INTO temp_assets (id, content, content_type) VALUES (?, ?, ?)",
            args: [assetId, buffer, file.type]
        });

        // The URL will point to our new serving route
        const publicUrl = `/api/video/serve/${assetId}`;

        return NextResponse.json({ success: true, url: publicUrl });
    } catch (error: any) {
        console.error('Upload API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
