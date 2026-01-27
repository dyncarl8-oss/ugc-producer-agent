
import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';

export async function GET() {
    try {
        await initDb();
        return NextResponse.json({ message: 'Database initialized successfully' });
    } catch (error: any) {
        console.error('DB Init Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
