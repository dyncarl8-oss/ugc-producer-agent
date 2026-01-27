
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const campaigns = await db.execute('SELECT * FROM campaigns');
        const shots = await db.execute('SELECT * FROM shots');
        return NextResponse.json({ campaigns: campaigns.rows, shots: shots.rows });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
