import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { GoogleGenAI, Type } from "@google/genai";

export const generateAdCampaign = inngest.createFunction(
    { id: "generate-ad-campaign" },
    { event: "campaign/generate" },
    async ({ event, step }) => {
        const { campaignId, userId, productB64, avatarB64, vibe } = event.data;
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

        if (!apiKey) {
            throw new Error("Missing Gemini API Key on server");
        }

        const ai = new GoogleGenAI({ apiKey });

        // Step 1: Generate Script
        const shots = await step.run("generate-script", async () => {
            const result = await ai.models.generateContent({
                model: "gemini-1.5-flash-latest",
                contents: [{
                    role: "user",
                    parts: [
                        { text: `You are a world-class TikTok UGC director. Analyze this product image and create a 4-part viral ad script. Vibe: ${vibe}. Output ONLY a valid JSON array of 4 objects with: type, script, imagePrompt, videoPrompt.` },
                        { inlineData: { data: productB64.split(',')[1] || productB64, mimeType: "image/png" } }
                    ]
                }],
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING },
                                script: { type: Type.STRING },
                                imagePrompt: { type: Type.STRING },
                                videoPrompt: { type: Type.STRING }
                            },
                            required: ["type", "script", "imagePrompt", "videoPrompt"]
                        }
                    }
                }
            });

            const script = JSON.parse(result.text || "[]");

            // Save to DB
            for (const shot of script) {
                await db.execute({
                    sql: "INSERT INTO shots (campaign_id, type, script, image_prompt, video_prompt, status) VALUES (?, ?, ?, ?, ?, ?)",
                    args: [campaignId, shot.type, shot.script, shot.imagePrompt, shot.videoPrompt, 'pending']
                });
            }
            return script;
        });

        // Step 2: Generate Shots Sequentially
        for (let i = 0; i < shots.length; i++) {
            const shot = shots[i];

            // 2a. Generate Reference Image
            const refImageB64 = await step.run(`generate-ref-${i}`, async () => {
                const result = await ai.models.generateContent({
                    model: "gemini-3-pro-image-preview",
                    contents: [{
                        role: "user",
                        parts: [
                            { text: `High-quality smartphone selfie photo. The host (Ref 1) is holding the product (Ref 2). ${shot.imagePrompt}. Real background, natural lighting, authentic social media quality, shot on iPhone 15.` },
                            { inlineData: { data: avatarB64.split(',')[1] || avatarB64, mimeType: "image/png" } },
                            { inlineData: { data: productB64.split(',')[1] || productB64, mimeType: "image/png" } }
                        ]
                    }],
                    config: {
                        // @ts-ignore
                        imageConfig: { aspectRatio: "9:16" }
                    }
                });

                const candidates = result.candidates || [];
                const parts = candidates[0]?.content?.parts || [];
                const part = parts.find((p: any) => p.inlineData);

                if (!part?.inlineData) throw new Error("No image generated");
                return `data:image/png;base64,${part.inlineData.data}`;
            });

            // Update DB with ref image
            await step.run(`update-db-ref-${i}`, async () => {
                await db.execute({
                    sql: "UPDATE shots SET ref_image = ?, status = 'generating' WHERE campaign_id = ? AND type = ?",
                    args: [refImageB64, campaignId, shot.type]
                });
            });

            // 2b. Generate Video
            const videoBase64 = await step.run(`generate-video-${i}`, async () => {
                const finalPrompt = `Tiktok style UGC video. The person is speaking directly to her handheld smartphone camera. ${shot.videoPrompt}. Authentic handheld jitters, realistic skin movement, natural daylight, no artificial filters, shot like a vlog. The person looks genuinely at the lens.`;

                // Start generation
                let operation = await ai.models.generateVideos({
                    model: "veo-3.1-fast-generate-preview",
                    prompt: finalPrompt,
                    image: {
                        imageBytes: refImageB64.split(',')[1],
                        mimeType: "image/png"
                    },
                    config: {
                        numberOfVideos: 1,
                        resolution: "720p",
                        aspectRatio: "9:16"
                    }
                });

                // Wait for completion
                while (!operation.done) {
                    await new Promise(resolve => setTimeout(resolve, 65000));
                    operation = await ai.operations.getVideosOperation({ operation });
                    if (operation.error) throw new Error(operation.error.message);
                }

                const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
                if (!videoUri) throw new Error("No video URI");

                // Download video
                const response = await fetch(`${videoUri}&key=${apiKey}`);
                if (!response.ok) throw new Error("Download failed");
                const buffer = await response.arrayBuffer();
                const b64 = Buffer.from(buffer).toString("base64");
                return `data:video/mp4;base64,${b64}`;
            });

            // Update DB with finished video
            await step.run(`update-db-video-${i}`, async () => {
                await db.execute({
                    sql: "UPDATE shots SET video_url = ?, status = 'completed' WHERE campaign_id = ? AND type = ?",
                    args: [videoBase64, campaignId, shot.type]
                });
            });

            // Safe cooloff before next shot
            if (i < shots.length - 1) {
                await step.sleep("cooloff", "65s");
            }
        }

        return { success: true, campaignId };
    }
);
