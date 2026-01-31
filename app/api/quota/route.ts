import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const getPacificDate = () => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
};

export async function GET() {
    try {
        const today = getPacificDate();

        // Get stats for today
        const result = await db.execute({
            sql: 'SELECT * FROM system_stats WHERE date = ?',
            args: [today]
        });

        let stats: any = result.rows[0];

        // Initialize if no record exists for today
        if (!stats) {
            await db.execute({
                sql: 'INSERT INTO system_stats (date, fast_usage, preview_usage) VALUES (?, 0, 0)',
                args: [today]
            });
            stats = { fast_usage: 0, preview_usage: 0 };
        }

        // Tier 1: First 2 generations (8 shots)
        if ((stats.preview_usage as number) < 8) {
            return NextResponse.json({
                allowed: true,
                model: 'veo-3.1-generate-preview',
                remainingInTier: 8 - (stats.preview_usage as number)
            });
        }

        // Tier 2: Next 2 generations (8 shots)
        if ((stats.fast_usage as number) < 8) {
            return NextResponse.json({
                allowed: true,
                model: 'veo-3.1-fast-generate-preview',
                remainingInTier: 8 - (stats.fast_usage as number)
            });
        }

        // Tier 3: Blocked
        return NextResponse.json({
            allowed: false,
            message: 'Daily system quota reached. Please try again tomorrow.'
        });

    } catch (error: any) {
        console.error('Quota Check Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { model, action } = await req.json();
        const today = getPacificDate();

        if (action === 'exhaust') {
            await db.execute({
                sql: 'UPDATE system_stats SET fast_usage = 8, preview_usage = 8 WHERE date = ?',
                args: [today]
            });
            return NextResponse.json({ success: true });
        }

        if (model === 'veo-3.1-fast-generate-preview') {
            await db.execute({
                sql: 'UPDATE system_stats SET fast_usage = fast_usage + 1 WHERE date = ?',
                args: [today]
            });
        } else if (model === 'veo-3.1-generate-preview') {
            await db.execute({
                sql: 'UPDATE system_stats SET preview_usage = preview_usage + 1 WHERE date = ?',
                args: [today]
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
