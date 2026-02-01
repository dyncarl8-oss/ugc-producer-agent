
import { GoogleGenAI, VideoGenerationReferenceType, Type } from "@google/genai";

export interface Shot {
  id: number;
  type: 'Hook' | 'Feature' | 'Demo' | 'CTA';
  script: string;
  imagePrompt: string;
  videoPrompt: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  videoUrl?: string;
  refImage?: string;
}

export class VeoService {
  private static lastCalls: number[] = [];

  private static async ensureQuota(onProgress?: (msg: string) => void) {
    const now = Date.now();
    // Keep only calls from the last 65 seconds
    this.lastCalls = this.lastCalls.filter(t => now - t < 65000);

    if (this.lastCalls.length >= 2) {
      const waitTime = 65000 - (now - this.lastCalls[0]);
      if (waitTime > 0) {
        await this.serverLog('info', `Quota protection: Waiting ${Math.ceil(waitTime / 1000)}s for next slot...`);

        // Polling wait to allow progress updates in UI
        const startWait = Date.now();
        while (Date.now() - startWait < waitTime) {
          const remaining = Math.ceil((waitTime - (Date.now() - startWait)) / 1000);
          if (onProgress) onProgress(`Optimizing cinematic quality...`);
          await new Promise(res => setTimeout(res, 1000));
        }
      }
      // Re-filter after waiting
      this.lastCalls = this.lastCalls.filter(t => Date.now() - t < 65000);
    }

    this.lastCalls.push(Date.now());
  }

  /**
   * Helper to ensure we only send raw base64 to the API
   */
  private static cleanBase64(b64: string): string {
    if (!b64) return "";
    return b64.includes(",") ? b64.split(",")[1] : b64;
  }

  /**
   * Helper to send logs to the server for visibility
   */
  private static async serverLog(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, message, data })
      });
    } catch (e) {
      console.warn("Failed to send server log:", e);
    }
  }

  /**
   * Helper to handle API retries for 429s (Quota) and 500s (Internal Errors)
   */
  private static async callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 20000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = (error.message || "").toLowerCase();
      const isRateLimit = errorMsg.includes("429") || errorMsg.includes("resource_exhausted") || errorMsg.includes("quota");
      const isInternalError = errorMsg.includes("500") || errorMsg.includes("503") || errorMsg.includes("internal error") || errorMsg.includes("server issue");

      if (isRateLimit || isInternalError) {
        if (retries > 0) {
          const type = isRateLimit ? "Rate limit" : "Server issue";
          await this.serverLog('warn', `${type} hit. Waiting ${delay / 1000}s for cooloff... (${retries} attempts left)`);
          await new Promise(res => setTimeout(res, delay));
          return this.callWithRetry(fn, retries - 1, delay * 2);
        }
      }
      throw error;
    }
  }

  /**
   * Stage 1: Generate a 4-part script by looking at the product image.
   */
  static async createScript(productB64: string, vibe: string, simulateMode = false): Promise<Shot[]> {
    await this.serverLog('info', `Generating script for vibe: ${vibe}`);

    if (simulateMode) {
      await new Promise(res => setTimeout(res, 2000));
      return [
        { id: 0, type: 'Hook', script: 'Hey everyone! Check this out.', imagePrompt: 'Host holding the product with a smile', videoPrompt: 'Zoom in on product', status: 'pending' },
        { id: 1, type: 'Feature', script: 'Look at the amazing texture.', imagePrompt: 'Close up of product detail', videoPrompt: 'Pan across the product labels', status: 'pending' },
        { id: 2, type: 'Demo', script: 'It works perfectly in any setting.', imagePrompt: 'Product on a table', videoPrompt: 'Hand picking up product', status: 'pending' },
        { id: 3, type: 'CTA', script: 'Get yours today!', imagePrompt: 'Host waving with product', videoPrompt: 'Final hero shot', status: 'pending' }
      ];
    }

    return this.callWithRetry(async () => {
      await this.ensureQuota();
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              text: `You are a world-class TikTok UGC director. Analyze this product image and create a 4-part viral ad script. 
            Vibe: ${vibe}.
            
            Requirements:
            1. Hook: Catchy opener speaking directly to camera.
            2. Feature: Demonstrating a key visual aspect of the product.
            3. Demo: Natural usage in a handheld "day in the life" style.
            4. CTA: Friendly sign-off.
            
            Output ONLY a valid JSON array of 4 objects with: type, script, imagePrompt, videoPrompt.
            Do not include markdown formatting or extra text.` },
            { inlineData: { data: this.cleanBase64(productB64), mimeType: 'image/png' } }
          ]
        },
        config: {
          responseMimeType: 'application/json',
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
              required: ['type', 'script', 'imagePrompt', 'videoPrompt']
            }
          }
        }
      });

      let text = response.text || "[]";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const data = JSON.parse(text);
      await this.serverLog('info', `Script generated successfully: ${data.length} shots`);
      return data.map((d: any, i: number) => ({ ...d, id: i, status: 'pending' }));
    });
  }

  /**
   * Stage 2: Generate unique reference images for shots using Nano Banana Pro.
   */
  static async generateShotReference(prompt: string, avatarB64: string, productB64: string, simulateMode = false): Promise<string> {
    await this.serverLog('info', `Generating reference frame...`);

    if (simulateMode) {
      await new Promise(res => setTimeout(res, 2000));
      return productB64; // Return product image as mock ref
    }

    return this.callWithRetry(async () => {
      await this.ensureQuota();
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { text: `High-quality smartphone selfie photo. The host (Ref 1) is holding the product (Ref 2). ${prompt}. Real background, natural lighting, authentic social media quality, shot on iPhone 15.` },
            { inlineData: { data: this.cleanBase64(avatarB64), mimeType: 'image/png' } },
            { inlineData: { data: this.cleanBase64(productB64), mimeType: 'image/png' } }
          ]
        },
        config: {
          imageConfig: { aspectRatio: "9:16" }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          await this.serverLog('info', `Reference frame generated successfully`);
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data in response");
    });
  }

  /**
   * Stage 3: Animate a specific shot with "Shot on Phone" physics.
   */
  static async animateShot(
    shot: Shot,
    refImageB64: string,
    onProgress: (msg: string) => void,
    modelName: string, // Dynamic model name
    simulateMode = false
  ): Promise<string> {
    await this.serverLog('info', `Starting animation for shot: ${shot.type} using ${modelName}`);

    if (simulateMode) {
      onProgress("Simulating render...");
      await new Promise(res => setTimeout(res, 3000));
      return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"; // Sample public video
    }

    const finalPrompt = `Tiktok style UGC video. The person is speaking directly to her handheld smartphone camera. ${shot.videoPrompt}. Authentic handheld jitters, realistic skin movement, natural daylight, no artificial filters, shot like a vlog. The person looks genuinely at the lens.`;

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    let operation = await this.callWithRetry(async () => {
      await this.ensureQuota(onProgress);
      return ai.models.generateVideos({
        model: modelName,
        prompt: finalPrompt,
        image: {
          imageBytes: this.cleanBase64(refImageB64),
          mimeType: 'image/png'
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '9:16'
        }
      });
    });

    // Polling loop
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Snappier 15s polling
      const statusMsg = `Enhancing footage (checking progress)...`;
      onProgress(statusMsg);
      await this.serverLog('info', `Polling status for ${shot.type}...`);

      const aiStatus = new GoogleGenAI({ apiKey });
      operation = await this.callWithRetry(() => aiStatus.operations.getVideosOperation({ operation: operation }));

      if (operation.error) {
        throw new Error(`Video generation failed: ${operation.error.message || 'Unknown API error'}`);
      }
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("No download link returned.");

    await this.serverLog('info', `Shot ${shot.type} complete. Downloading...`);
    const response = await this.callWithRetry(() => fetch(`${downloadLink}&key=${apiKey}`));

    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }
}
