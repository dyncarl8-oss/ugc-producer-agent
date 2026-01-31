import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const result = await db.execute({
            sql: "SELECT content, content_type FROM temp_assets WHERE id = ?",
            args: [id]
        });

        if (result.rows.length === 0) {
            return new NextResponse('Asset not found', { status: 404 });
        }

        const asset = result.rows[0];
        const content = asset.content as unknown as Buffer;
        const contentType = asset.content_type as string;

        return new NextResponse(content, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, immutable',
            },
        });
    } catch (error) {
        console.error('Error serving asset:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
