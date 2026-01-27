
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const { action, campaignId, data } = await req.json();

        if (action === 'createCampaign') {
            await db.execute({
                sql: 'INSERT INTO campaigns (id, vibe, status) VALUES (?, ?, ?)',
                args: [campaignId, data.vibe, 'pending']
            });
            return NextResponse.json({ success: true });
        }

        if (action === 'saveShots') {
            const { shots } = data;
            for (const shot of shots) {
                await db.execute({
                    sql: 'INSERT INTO shots (campaign_id, type, script, image_prompt, video_prompt, status) VALUES (?, ?, ?, ?, ?, ?)',
                    args: [campaignId, shot.type, shot.script, shot.imagePrompt, shot.videoPrompt, 'pending']
                });
            }
            return NextResponse.json({ success: true });
        }

        if (action === 'updateShot') {
            const { type, status, videoUrl, refImage } = data;
            await db.execute({
                sql: 'UPDATE shots SET status = ?, video_url = ?, ref_image = ? WHERE campaign_id = ? AND type = ?',
                args: [status, videoUrl || null, refImage || null, campaignId, type]
            });
            return NextResponse.json({ success: true });
        }

        if (action === 'finishCampaign') {
            await db.execute({
                sql: 'UPDATE campaigns SET status = ?, master_video_url = ? WHERE id = ?',
                args: ['completed', data.masterVideoUrl, campaignId]
            });
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('Campaign API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
