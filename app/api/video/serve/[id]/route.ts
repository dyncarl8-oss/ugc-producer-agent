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

        // Return a proper response with headers that Creatomate likes
        return new NextResponse(new Uint8Array(content), {
            headers: {
                'Content-Type': contentType,
                'Content-Length': content.length.toString(),
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
                'Accept-Ranges': 'bytes'
            },
        });
    } catch (error) {
        console.error('Error serving asset:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
