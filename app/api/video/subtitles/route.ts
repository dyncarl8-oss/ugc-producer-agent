import { NextResponse } from 'next/server';
import { headers } from "next/headers";
import { whop } from "@/lib/whop";

export async function POST(req: Request) {
    try {
        const head = await headers();
        const { userId } = await whop.verifyUserToken(head);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const videoFile = formData.get('video') as File;
        const segmentsJson = formData.get('segments') as string;
        const segments = JSON.parse(segmentsJson);

        if (!videoFile) {
            return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
        }

        const apiKey = process.env.CREATOMATE_API_KEY;
        if (!apiKey || apiKey === 'your_creatomate_api_key_here' || apiKey.length < 10) {
            return NextResponse.json({ error: 'Creatomate API Key is missing or invalid.' }, { status: 500 });
        }

        // 1. Upload video to Creatomate Storage
        const uploadFormData = new FormData();
        uploadFormData.append('file', videoFile);

        const uploadRes = await fetch('https://api.creatomate.com/v1/uploads', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: uploadFormData
        });

        if (!uploadRes.ok) {
            const err = await uploadRes.json();
            throw new Error(`Creatomate upload failed: ${err.message || uploadRes.statusText}`);
        }

        const uploadData = await uploadRes.json();
        const videoUrl = uploadData.url;

        // 2. Prepare render elements
        const elements: any[] = [
            {
                type: 'video',
                id: 'video-element',
                source: videoUrl
            }
        ];

        // 3. Add script-based captions
        let cumulativeTime = 0;
        if (segments && Array.isArray(segments)) {
            segments.forEach((seg: { text: string; duration: number }) => {
                elements.push({
                    type: 'text',
                    text: seg.text,
                    time: cumulativeTime,
                    duration: seg.duration,
                    y: '82%',
                    width: '81%',
                    height: '35%',
                    x_alignment: '50%',
                    y_alignment: '50%',
                    fill_color: '#ffffff',
                    stroke_color: '#000000',
                    stroke_width: '1.6 vmin',
                    font_family: 'Montserrat',
                    font_weight: '700',
                    font_size: '9.29 vmin',
                    background_color: 'rgba(216,216,216,0)',
                    background_x_padding: '31%',
                    background_y_padding: '17%',
                    background_border_radius: '31%',
                    animations: [
                        {
                            type: 'text-appearance',
                            time: 0,
                            duration: 0.3,
                            transition: 'fade'
                        }
                    ]
                });
                cumulativeTime += seg.duration;
            });
        }

        // 4. Initial Render Request
        const response = await fetch('https://api.creatomate.com/v1/renders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                output_format: 'mp4',
                source: {
                    elements
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Creatomate render request failed');
        }

        let render = await response.json();

        // 2. Simple Polling Loop (Short Wait)
        // Since we are in a serverless route, we should be careful with long waits.
        // We'll poll for 55 seconds max before returning the ID for frontend to take over.
        const start = Date.now();
        while (render.status !== 'succeeded' && render.status !== 'failed' && (Date.now() - start) < 55000) {
            await new Promise(res => setTimeout(res, 3000));
            const pollRes = await fetch(`https://api.creatomate.com/v1/renders/${render.id}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (pollRes.ok) {
                render = await pollRes.json();
            }
        }

        return NextResponse.json(render);
    } catch (error: any) {
        console.error('Subtitle API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
