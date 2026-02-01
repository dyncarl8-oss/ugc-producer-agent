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

        const { videoUrl, segments, options = {} } = await req.json();
        console.log('[Subtitles API] Request for video:', videoUrl, 'with segments:', segments?.length);

        if (!videoUrl) {
            return NextResponse.json({ error: 'No video URL provided' }, { status: 400 });
        }

        const apiKey = process.env.CREATOMATE_API_KEY;
        if (!apiKey || apiKey === 'your_creatomate_api_key_here' || apiKey.length < 10) {
            console.error('[Subtitles API] Invalid API Key');
            return NextResponse.json({ error: 'Creatomate API Key is missing or invalid.' }, { status: 500 });
        }

        // 1. Prepare render elements
        const videoElementId = 'v0';
        const elements: any[] = [
            {
                type: 'video',
                id: videoElementId,
                source: videoUrl
            }
        ];

        // Style helper
        const commonTextProps = {
            transcript_effect: options.transcript_effect || 'highlight',
            y: options.y || '82%',
            width: options.width || '81%',
            height: options.height || '35%',
            x_alignment: '50%',
            y_alignment: '50%',
            fill_color: options.fill_color || '#ffffff',
            stroke_color: options.stroke_color || '#000000',
            stroke_width: options.stroke_width || '1.6 vmin',
            font_family: options.font_family || 'Montserrat',
            font_weight: options.font_weight || '700',
            font_size: options.font_size || '9.29 vmin',
            background_color: options.background_color || 'rgba(216,216,216,0)',
            background_x_padding: '31%',
            background_y_padding: '17%',
            background_border_radius: '31%'
        };

        if (segments && segments.length > 0) {
            // Manual segment mode (Better for silent videos)
            let currentTime = 0;
            segments.forEach((seg: any) => {
                elements.push({
                    type: 'text',
                    text: seg.text,
                    time: currentTime,
                    duration: seg.duration,
                    ...commonTextProps
                });
                currentTime += seg.duration;
            });
        } else {
            // Auto-transcription mode (Fails if silent)
            elements.push({
                type: 'text',
                transcript_source: videoElementId,
                transcript_maximum_length: options.transcript_maximum_length || 14,
                ...commonTextProps
            });
        }

        console.log('[Subtitles API] Sending render request to Creatomate...');
        // 2. Initial Render Request
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
            console.error('[Subtitles API] Creatomate Error:', err);
            throw new Error(err.message || 'Creatomate render request failed');
        }

        let render = await response.json();
        console.log('[Subtitles API] Render initiated:', render.id);

        // 3. Simple Polling Loop (Short Wait)
        const start = Date.now();
        const MAX_POLL_TIME = 60000; // 60 seconds

        while (render.status !== 'succeeded' && render.status !== 'failed' && (Date.now() - start) < MAX_POLL_TIME) {
            console.log(`[Subtitles API] Polling render ${render.id}, status: ${render.status}`);
            await new Promise(res => setTimeout(res, 3000));
            const pollRes = await fetch(`https://api.creatomate.com/v1/renders/${render.id}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (pollRes.ok) {
                render = await pollRes.json();
            } else {
                console.warn('[Subtitles API] Polling failed, status code:', pollRes.status);
            }
        }

        if (render.status === 'failed') {
            console.error('[Subtitles API] Render failed on Creatomate:', render.error_message);
        }

        return NextResponse.json(render);
    } catch (error: any) {
        console.error('Subtitle API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
