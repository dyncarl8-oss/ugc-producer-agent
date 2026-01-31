'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Play, Loader2, Key, ShieldAlert, Smartphone, Sparkles, User, Box, ShoppingBag, Clapperboard, CheckCircle2, AlertCircle, Layers, RefreshCcw, Download, Zap, Plus, CreditCard, ChevronRight, X, Trash2 } from 'lucide-react';
import { AdVibe, AspectRatio, Config, GenerationStatus } from '../types';
import { VeoService, Shot } from '../services/veoService';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { WhopCheckoutEmbed } from "@whop/checkout/react";



declare global {
    var aistudio: {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    };
}

const App: React.FC = () => {
    const [config, setConfig] = useState<Config>({
        projectId: '',
        location: 'us-central1',
        simulateMode: false,
        aspectRatio: AspectRatio.PORTRAIT
    });

    const [vibe, setVibe] = useState<AdVibe>(AdVibe.EXCITED_UNBOXING);
    const [productImage, setProductImage] = useState<string | null>(null);
    const [avatarImage, setAvatarImage] = useState<string | null>(null);
    const [status, setStatus] = useState<GenerationStatus>({ stage: 'idle', message: '' });
    const [hasKey, setHasKey] = useState(false);
    const [campaignId, setCampaignId] = useState<string | null>(null);
    const [user, setUser] = useState<{ id: string; username: string; profile_pic_url: string; credits: number } | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);
    const [projects, setProjects] = useState<any[]>([]);

    const [shots, setShots] = useState<Shot[]>([]);
    const [currentShotId, setCurrentShotId] = useState<number | null>(null);
    const [masterVideoUrl, setMasterVideoUrl] = useState<string | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState('/templates/template1.png');
    const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);

    const ffmpegRef = useRef<any>(null);
    const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
    const [selectedProject, setSelectedProject] = useState<any | null>(null);
    const [modalVideoUrl, setModalVideoUrl] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
    const [checkoutPurchaseUrl, setCheckoutPurchaseUrl] = useState<string | null>(null);
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
    const [loadingCheckout, setLoadingCheckout] = useState(false);
    const [showQuotaModal, setShowQuotaModal] = useState(false);
    const [quotaMessage, setQuotaMessage] = useState('');
    const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

    const params = useParams();
    const companyId = params?.companyId as string || '';

    useEffect(() => {
        const loadAvatar = async (path: string) => {
            try {
                const response = await fetch(path);
                if (response.ok) {
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => setAvatarImage(reader.result as string);
                    reader.readAsDataURL(blob);
                }
            } catch (e) { console.warn("Avatar not found:", path); }
        };
        loadAvatar(selectedTemplate);
        loadFFmpeg();
    }, [selectedTemplate]);

    const loadFFmpeg = async () => {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        const ffmpeg = new FFmpeg();
        ffmpegRef.current = ffmpeg;

        ffmpeg.on('log', ({ message }) => {
            console.log(message);
        });
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFfmpegLoaded(true);
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await fetch('/api/auth/me');
                if (response.ok) {
                    const data = await response.json();
                    setUser(data);
                    // Fetch projects too
                    fetchProjects();
                }
            } catch (e) { console.error("Failed to fetch Whop user"); }
            finally { setLoadingAuth(false); }
        };

        const fetchProjects = async () => {
            try {
                const response = await fetch('/api/campaign', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'getCampaigns' })
                });
                if (response.ok) {
                    const data = await response.json();
                    setProjects(data.campaigns);
                }
            } catch (e) { console.error("Failed to fetch projects"); }
        };

        fetchUser();

        const checkKey = async () => {
            if (window.aistudio) {
                const selected = await window.aistudio.hasSelectedApiKey();
                setHasKey(selected);
            }
        };
        checkKey();
    }, []);

    const handleDeleteProject = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setProjectToDelete(id);
    };

    const confirmDelete = async () => {
        if (!projectToDelete) return;

        try {
            const response = await fetch('/api/campaign', {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteCampaign', campaignId: projectToDelete })
            });

            if (response.ok) {
                setProjects(prev => prev.filter(p => p.id !== projectToDelete));
                if (selectedProject?.id === projectToDelete) {
                    setSelectedProject(null);
                    setModalVideoUrl(null);
                }
            }
        } catch (e) {
            console.error("Failed to delete project:", e);
        } finally {
            setProjectToDelete(null);
        }
    };

    const concatenateVideos = async (videoUrls: string[]) => {
        const ffmpeg = ffmpegRef.current;
        setStatus({ stage: 'generating', message: 'Stitching final ad...' });

        try {
            const inputFiles: string[] = [];
            for (let i = 0; i < videoUrls.length; i++) {
                const fileName = `input${i}.mp4`;
                await ffmpeg.writeFile(fileName, await fetchFile(videoUrls[i]));
                inputFiles.push(`file ${fileName}`);
            }

            await ffmpeg.writeFile('concat_list.txt', inputFiles.join('\n'));

            // Run ffmpeg concatenation
            await ffmpeg.exec([
                '-f', 'concat',
                '-safe', '0',
                '-i', 'concat_list.txt',
                '-c', 'copy',
                'output.mp4'
            ]);

            const data = await ffmpeg.readFile('output.mp4');
            const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: 'video/mp4' }));
            setMasterVideoUrl(url);

            // Clean up
            for (let i = 0; i < videoUrls.length; i++) {
                await ffmpeg.deleteFile(`input${i}.mp4`);
            }
            await ffmpeg.deleteFile('concat_list.txt');
            await ffmpeg.deleteFile('output.mp4');

            return url;
        } catch (error) {
            console.error('FFmpeg Error:', error);
            throw new Error('Failed to stitch videos together.');
        }
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    // uploadVideo has been removed in favor of direct DB storage

    const handleGenerateFullAd = async () => {
        if (!productImage || !avatarImage) {
            setStatus({ stage: 'error', message: 'Please upload a product image first.' });
            return;
        }

        // 0. Credit Check
        if (user && user.credits <= 0) {
            setShowPaymentModal(true);
            return;
        }

        if (!ffmpegLoaded) {
            setStatus({ stage: 'error', message: 'FFmpeg is still loading. Please wait.' });
            return;
        }

        // Ensure API Key selection
        if (!hasKey && window.aistudio) {
            await window.aistudio.openSelectKey();
            setHasKey(true);
        }

        setStatus({ stage: 'generating', message: 'Analyzing your product...', progress: 5 });
        setShots([]);
        setMasterVideoUrl(null);

        try {
            const productB64 = productImage.split(',')[1];
            const newCampaignId = `camp_${Date.now()}`;
            setCampaignId(newCampaignId);

            // Check Quota Before Starting
            const quotaRes = await fetch('/api/quota');
            const quota = await quotaRes.json();

            if (!quota.allowed) {
                setQuotaMessage(quota.message || 'Daily limit reached.');
                setShowQuotaModal(true);
                setStatus({ stage: 'idle', message: '' });
                return;
            }

            const modelToUse = quota.model || 'veo-3.1-fast-generate-preview';

            // Initial DB entry
            const createRes = await fetch('/api/campaign', {
                method: 'POST',
                body: JSON.stringify({ action: 'createCampaign', campaignId: newCampaignId, data: { vibe } })
            });

            if (!createRes.ok) {
                const errData = await createRes.json();
                throw new Error(errData.error || 'Failed to create campaign');
            }

            const createData = await createRes.json();
            if (user) setUser({ ...user, credits: createData.newCredits });

            // 1. Vision-Enhanced Scripting
            setStatus({ stage: 'generating', message: `Drafting viral ad script...`, progress: 15 });
            const generatedShots = await VeoService.createScript(productB64, vibe, config.simulateMode);
            setShots(generatedShots);

            // Save shots to DB
            await fetch('/api/campaign', {
                method: 'POST',
                body: JSON.stringify({ action: 'saveShots', campaignId: newCampaignId, data: { shots: generatedShots } })
            });

            const completedVideoUrls: string[] = [];

            // 2. Sequential Shot Production
            const totalShots = generatedShots.length;
            for (let i = 0; i < totalShots; i++) {
                const shot = generatedShots[i];
                setCurrentShotId(shot.id);

                const shotProgressBase = 15;
                const shotProgressRange = 70;
                const currentShotStartingProgress = shotProgressBase + (i / totalShots) * shotProgressRange;

                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'generating' } : s));
                setStatus({
                    stage: 'generating',
                    message: `Generating footage...`,
                    progress: Math.round(currentShotStartingProgress)
                });

                // Generate the context-specific reference frame
                const refImg = await VeoService.generateShotReference(shot.imagePrompt, avatarImage, productImage, config.simulateMode);
                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, refImage: refImg } : s));

                // Start Handheld Animation
                const videoUrl = await VeoService.animateShot(shot, refImg, (msg) => {
                    // Filter technical messages, keep it vague but professional
                    if (!msg.toLowerCase().includes('cooloff') && !msg.toLowerCase().includes('rendering')) {
                        setStatus(prev => ({ ...prev, message: `Finalizing cinematic details...` }));
                    }
                }, modelToUse, config.simulateMode);

                // Increment Usage
                await fetch('/api/quota', {
                    method: 'POST',
                    body: JSON.stringify({ model: modelToUse })
                });

                completedVideoUrls.push(videoUrl);
                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'completed', videoUrl } : s));

                // Upload shot components to permanent storage
                let permanentShotVideoUrl = videoUrl;
                let permanentRefImageUrl = refImg;

                try {
                    // For shots, we'll keep them as blob URLs for the session, 
                    // but we won't persist them to DB as base64 to save space.
                    // Only the final video will be persisted.
                    /* 
                    if (videoUrl && videoUrl.startsWith('blob:')) {
                         const response = await fetch(videoUrl);
                         const blob = await response.blob();
                         permanentShotVideoUrl = await blobToBase64(blob);
                    }
                    */
                } catch (e) {
                    console.error("Failed to process shot", e);
                }

                // Update shot in DB
                await fetch('/api/campaign', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'updateShot',
                        campaignId: newCampaignId,
                        data: {
                            type: shot.type,
                            status: 'completed',
                            videoUrl: permanentShotVideoUrl,
                            refImage: permanentRefImageUrl
                        }
                    })
                });

                // Shots now handle their own quota wait internally in VeoService
                if (i < generatedShots.length - 1) {
                    setStatus({
                        stage: 'generating',
                        message: `Staging next shot...`,
                        progress: Math.round(shotProgressBase + ((i + 0.5) / totalShots) * shotProgressRange)
                    });
                }
            }

            // 3. Final Stitching
            setStatus({ stage: 'generating', message: 'Merging final cinematic cut...', progress: 95 });
            const finalBlobUrl = await concatenateVideos(completedVideoUrls);

            // 4. Measure Durations and Generate Subtitles
            let masterVideoUrlToSave = finalBlobUrl;
            if (finalBlobUrl) {
                try {
                    setStatus({ stage: 'generating', message: 'Measuring shot timings...', progress: 97 });

                    // Measure each shot's duration
                    const segments = [];
                    for (const shot of shots) {
                        if (shot.videoUrl) {
                            try {
                                const duration = await new Promise<number>((resolve) => {
                                    const v = document.createElement('video');
                                    v.src = shot.videoUrl!;
                                    v.onloadedmetadata = () => resolve(v.duration);
                                    v.onerror = () => resolve(5); // Fallback to 5s if measurement fails
                                });
                                segments.push({ text: shot.script, duration });
                            } catch (e) {
                                segments.push({ text: shot.script, duration: 5 });
                            }
                        }
                    }

                    // Convert final blob to File for upload
                    const videoResponse = await fetch(finalBlobUrl);
                    const videoBlob = await videoResponse.blob();
                    const videoFile = new File([videoBlob], 'stitched-video.mp4', { type: 'video/mp4' });

                    const formData = new FormData();
                    formData.append('file', videoFile);

                    // Upload to get a public URL
                    const uploadRes = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
                    });

                    if (!uploadRes.ok) throw new Error('Failed to upload video for subtitling');
                    const uploadData = await uploadRes.json();
                    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                    const publicUrl = `${appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl}${uploadData.url}`;

                    // Call Subtitles API with segments
                    setStatus({ stage: 'generating', message: 'Generating script-based subtitles...', progress: 98 });
                    const subRes = await fetch('/api/video/subtitles', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            videoUrl: publicUrl,
                            segments
                        })
                    });

                    if (!subRes.ok) {
                        const err = await subRes.json();
                        throw new Error(err.error || "Subtitles failed to initialize");
                    }

                    const render = await subRes.json();
                    if (render.status === 'succeeded' && render.url) {
                        masterVideoUrlToSave = render.url;
                    } else {
                        throw new Error(`Subtitle render failed: ${render.error_message || render.status}`);
                    }
                } catch (e: any) {
                    console.error("Subtitles failed:", e);
                    setStatus({ stage: 'error', message: `Subtitle Generation Failed: ${e.message}. Showing original video.` });
                    await new Promise(res => setTimeout(res, 3000));
                }
            }

            // Upload the final video to permanent storage (Base64 in DB)
            if (masterVideoUrlToSave) {
                try {
                    const response = await fetch(masterVideoUrlToSave);
                    const blob = await response.blob();
                    const base64Video = await blobToBase64(blob);

                    // Finish campaign in DB with the Base64 String
                    await fetch('/api/campaign', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'finishCampaign', campaignId: newCampaignId, data: { masterVideoUrl: base64Video } })
                    });

                    setMasterVideoUrl(masterVideoUrlToSave);
                } catch (e) {
                    console.error("Failed to save final video permanently", e);
                    await fetch('/api/campaign', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'finishCampaign', campaignId: newCampaignId, data: { masterVideoUrl: 'Saved' } })
                    });
                }
            } else {
                await fetch('/api/campaign', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'finishCampaign', campaignId: newCampaignId, data: { masterVideoUrl: 'Saved' } })
                });
            }

            setStatus({ stage: 'completed', message: 'Ad campaign ready!', progress: 100 });
            setCurrentShotId(null);
        } catch (error: any) {
            console.error("Studio Error:", error);

            const errorMsg = (error.message || "").toLowerCase();
            const isQuotaError = errorMsg.includes("429") || errorMsg.includes("resource_exhausted") || errorMsg.includes("quota");

            if (isQuotaError) {
                // Manually exhaust quota for today to show the System Overload modal to all users
                await fetch('/api/quota', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'exhaust' })
                });
                setQuotaMessage("Daily system quota reached. Please try again after 4:00 PM PHT.");
                setShowQuotaModal(true);
                setStatus({ stage: 'idle', message: '' });
            } else if (error.message?.includes("Requested entity was not found")) {
                setHasKey(false);
                if (window.aistudio) await window.aistudio.openSelectKey();
                setStatus({ stage: 'error', message: 'API Project not found. Please re-select a paid project.' });
            } else {
                setStatus({ stage: 'error', message: error.message || 'The studio encountered an issue. Please try again.' });
            }

            setShots(prev => prev.map(s => s.status === 'generating' ? { ...s, status: 'error' } : s));
        }
    };

    const downloadMasterAd = () => {
        if (!masterVideoUrl) return;
        const a = document.createElement('a');
        a.href = masterVideoUrl;
        a.download = 'viral-ad-master.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleBuyCredits = async (packageId: string) => {
        setLoadingCheckout(true);
        setSelectedPackageId(packageId);
        try {
            const response = await fetch('/api/payments/checkout', {
                method: 'POST',
                body: JSON.stringify({ packageId })
            });
            console.log("Checkout API Response Status:", response.status);
            if (response.ok) {
                const data = await response.json();
                console.log("Checkout Session ID received:", data.sessionId);
                setCheckoutSessionId(data.sessionId);
                setCheckoutPurchaseUrl(data.purchaseUrl);
            } else {
                const err = await response.json();
                console.error("Checkout API Error:", err);
            }
        } catch (e) {
            console.error("Failed to create checkout session", e);
        } finally {
            setLoadingCheckout(false);
        }
    };



    if (loadingAuth) {
        return (
            <div className="flex items-center justify-center h-screen bg-white dark:bg-[#030305] text-orange-600 dark:text-orange-500">
                <Loader2 className="w-12 h-12 animate-spin" />
            </div>
        );
    }

    if (!user && status.stage !== 'generating') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-[#030305] text-slate-900 dark:text-slate-100 p-8 text-center">
                <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-orange-500/20">
                    <ShieldAlert className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 italic">Security Checkpoint</h2>
                <p className="text-slate-500 max-w-md mx-auto mb-8 font-medium">Please open UGC Producer Agent through the Whop Dashboard to authenticate your session.</p>
                <div className="flex gap-4">
                    <a href="https://whop.com" className="bg-slate-900 dark:bg-white text-white dark:text-black px-8 py-3 rounded-2xl font-black uppercase text-sm hover:bg-slate-800 dark:hover:bg-slate-200 transition-all">Go to Whop</a>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-white dark:bg-[#030305] text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-80 bg-slate-50 dark:bg-[#07070a] border-r border-slate-200 dark:border-white/5 flex flex-col p-6 overflow-y-auto">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                        <Clapperboard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">UGC Producer</h1>
                        <span className="text-[10px] text-orange-500 font-bold uppercase tracking-widest leading-none">AI Agent Studio</span>
                    </div>
                </div>

                {user && (
                    <div className="mb-8 p-4 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            {user.profile_pic_url ? (
                                <img
                                    src={user.profile_pic_url}
                                    alt={user.username}
                                    className="w-12 h-12 rounded-full border border-orange-500/30 object-cover shadow-lg"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).parentElement?.querySelector('.avatar-placeholder')?.classList.remove('hidden');
                                    }}
                                />
                            ) : null}
                            <div className={`avatar-placeholder ${user.profile_pic_url ? 'hidden' : ''} w-12 h-12 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center shadow-lg`}>
                                <User className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight truncate">{user.username}</span>
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-600/20 border border-orange-500/30 rounded-full shrink-0">
                                        <Zap className="w-2.5 h-2.5 text-orange-600 dark:text-orange-500 fill-orange-500" />
                                        <span className="text-[10px] text-orange-800 dark:text-orange-200 font-black tracking-tighter">{user.credits}</span>
                                    </div>
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Verified Account</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowPaymentModal(true)}
                            className="w-full py-2.5 bg-orange-600/10 border border-orange-500/20 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-600/20 transition-all group"
                        >
                            <Plus className="w-3.5 h-3.5 text-orange-600 dark:text-orange-500 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-orange-800 dark:text-orange-200 uppercase tracking-widest">Top Up Credits</span>
                        </button>
                    </div>
                )}

                <div className="flex-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 ml-2">Recent Projects</div>
                    <div className="space-y-3">
                        {projects.length === 0 ? (
                            <div className="p-4 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl text-center">
                                <p className="text-[10px] text-slate-400 dark:text-slate-600 font-medium">No projects yet</p>
                            </div>
                        ) : (
                            projects.slice(0, 8).map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => {
                                        setSelectedProject(p);
                                        // Use the stored URL if it exists and is not just a placeholder
                                        if (p.master_video_url && p.master_video_url !== 'Saved') {
                                            setModalVideoUrl(p.master_video_url);
                                        } else if (p.id === campaignId && masterVideoUrl) {
                                            // Fallback for current session if not yet uploaded or if it's the current one
                                            setModalVideoUrl(masterVideoUrl);
                                        } else {
                                            setModalVideoUrl(null);
                                        }
                                    }}
                                    className="p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all cursor-pointer group relative"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate max-w-[120px]">{p.vibe}</span>
                                        <button
                                            onClick={(e) => handleDeleteProject(e, p.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-md transition-all text-slate-500 hover:text-red-500"
                                            title="Delete Project"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="text-[9px] text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest">
                                        {new Date(p.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="pt-6 border-t border-white/5 space-y-3" />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col p-8 overflow-y-auto items-center">
                <div className="max-w-5xl w-full flex flex-col gap-10">

                    <div className="text-center space-y-3">
                        <h2 className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter italic uppercase leading-none">UGC Producer</h2>
                        <p className="text-slate-500 text-base font-medium uppercase tracking-widest">3-Step Viral Production Flow</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12 items-start">
                        {/* 3 Step Flow */}
                        <div className="space-y-8">
                            {/* Step 1: Upload */}
                            <section className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">01</span>
                                    Upload Product
                                </label>
                                <label className={`flex flex-col items-center justify-center w-full aspect-square max-h-[160px] rounded-[32px] border-2 border-dashed transition-all cursor-pointer ${productImage ? 'border-orange-500/40 bg-orange-500/5' : 'border-slate-200 dark:border-white/10 hover:border-orange-500/30 bg-slate-50 dark:bg-white/5 shadow-inner'
                                    }`}>
                                    {productImage ? (
                                        <img src={productImage} alt="Product" className="w-full h-full object-contain p-6" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 opacity-20 group">
                                            <ShoppingBag className="w-8 h-8 group-hover:scale-110 transition-transform text-slate-900 dark:text-white" />
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-900 dark:text-white">Drop Item</span>
                                        </div>
                                    )}
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const r = new FileReader();
                                            r.onload = () => setProductImage(r.result as string);
                                            r.readAsDataURL(file);
                                        }
                                    }} />
                                </label>
                            </section>

                            {/* Step 2: Vibe */}
                            <section className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">02</span>
                                    Set Vibe
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.values(AdVibe).map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setConfig(prev => ({ ...prev, vibe: v }))}
                                            className={`p-4 rounded-2xl border transition-all text-left group ${config.vibe === v
                                                ? 'bg-orange-600 border-orange-500'
                                                : 'bg-white dark:bg-transparent border-slate-200 dark:border-white/10 hover:border-orange-500/50'
                                                }`}
                                        >
                                            <div className={`text-[10px] font-black uppercase tracking-widest ${config.vibe === v ? 'text-white' : 'text-slate-400 group-hover:text-orange-500'}`}>
                                                {v}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Step 3: Aspect Ratio */}
                            <section className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">03</span>
                                    Aspect Ratio
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => setConfig(prev => ({ ...prev, aspectRatio: r }))}
                                            className={`p-4 rounded-2xl border transition-all text-center font-black text-xs ${config.aspectRatio === r
                                                ? 'bg-orange-600 border-orange-500 text-white'
                                                : 'bg-white dark:bg-transparent border-slate-200 dark:border-white/10 text-slate-500 hover:border-orange-500/50'
                                                }`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        </div>

                        {/* Viewfinder Preview */}
                        <div className="sticky top-8 space-y-6">
                            <div className="relative group">
                                <div className={`w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-[32px] overflow-hidden transition-all duration-700 shadow-2xl ${config.aspectRatio === '9:16' ? 'aspect-[9/16]' : config.aspectRatio === '16:9' ? 'aspect-[16/9]' : 'aspect-square'}`}>
                                    {/* Viewfinder Overlay */}
                                    <div className="absolute inset-0 z-10 pointer-events-none p-6 flex flex-col justify-between">
                                        <div className="flex justify-between items-start opacity-40">
                                            <div className="w-12 h-12 border-t-2 border-l-2 border-orange-500" />
                                            <div className="w-12 h-12 border-t-2 border-r-2 border-orange-500" />
                                        </div>
                                        <div className="flex justify-between items-end opacity-40">
                                            <div className="w-12 h-12 border-b-2 border-l-2 border-orange-500" />
                                            <div className="w-12 h-12 border-b-2 border-r-2 border-orange-500" />
                                        </div>
                                    </div>

                                    {/* Media Content */}
                                    <div className="w-full h-full relative group">
                                        {masterVideoUrl ? (
                                            <video
                                                src={masterVideoUrl}
                                                controls
                                                autoPlay
                                                loop
                                                className="w-full h-full object-cover"
                                            />
                                        ) : status.stage === 'generating' ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-12 text-center bg-slate-50/50 dark:bg-[#07070a]/50 backdrop-blur-sm">
                                                <div className="relative">
                                                    <div className="w-24 h-24 border-2 border-orange-500/20 rounded-full animate-ping absolute inset-0" />
                                                    <div className="w-24 h-24 border-b-4 border-orange-500 rounded-full animate-spin relative flex items-center justify-center">
                                                        <Sparkles className="w-10 h-10 text-orange-500" />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase italic tracking-tighter">AI Processing</h3>
                                                    <p className="text-orange-600 dark:text-orange-500/80 text-[10px] font-bold uppercase tracking-[0.2em]">{status.message}</p>
                                                    <div className="w-48 h-1 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden mx-auto mt-4">
                                                        <div className="h-full bg-orange-600 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '40%' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : productImage ? (
                                            <img src={productImage} alt="Product" className="w-full h-full object-contain p-8 bg-slate-100/30 dark:bg-white/5" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-12 text-center bg-slate-50 dark:bg-white/2">
                                                <div className="w-20 h-20 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-full flex items-center justify-center">
                                                    <Box className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                                                </div>
                                                <div className="space-y-2">
                                                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">Awaiting Stage</h3>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-700 font-medium">Upload your product to begin the AI composition</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Action Button */}
                            <div className="relative">
                                <button
                                    onClick={handleGenerateFullAd}
                                    disabled={status.stage === 'generating'}
                                    className={`w-full py-6 rounded-3xl flex items-center justify-center gap-4 transition-all animate-in slide-in-from-bottom duration-700 delay-300 relative overflow-hidden group ${status.stage === 'generating'
                                        ? 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                        : 'bg-orange-600 hover:bg-orange-500 text-white shadow-2xl shadow-orange-600/40 hover:scale-[1.02] active:scale-[0.98]'
                                        }`}
                                >
                                    {status.stage === 'generating' ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <Play className="w-6 h-6 fill-current" />
                                    )}
                                    <span className="text-lg font-black italic uppercase tracking-tighter shrink-0">
                                        {status.stage === 'generating' ? status.message : 'Start Generation'}
                                    </span>
                                    {status.stage !== 'generating' && (
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full border border-white/10 shrink-0">
                                            <Zap className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                                            <span className="text-xs font-black tracking-normal italic">1</span>
                                        </div>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Video Modal */}
            {selectedProject && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="relative h-full max-h-[85vh] aspect-[9/16] bg-white dark:bg-[#0c0c12] rounded-[48px] border-[12px] border-slate-200 dark:border-[#16161c] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden">

                        {/* Modal Header HUD */}
                        <div className="absolute top-6 right-6 z-[130] flex items-center gap-3">
                            <button
                                onClick={() => {
                                    const a = document.createElement('a');
                                    a.href = modalVideoUrl || '';
                                    a.download = `ugc-video-${selectedProject.id}.mp4`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                }}
                                disabled={!modalVideoUrl}
                                className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-full font-black text-[10px] uppercase tracking-widest shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Download className="w-2.5 h-2.5" />
                                Download
                            </button>
                            <button
                                onClick={() => setSelectedProject(null)}
                                className="w-9 h-9 bg-black/80 hover:bg-black/90 rounded-full flex items-center justify-center border border-white/10 transition-all shadow-lg"
                            >
                                <X className="w-4 h-4 text-white" />
                            </button>
                        </div>

                        {modalVideoUrl ? (
                            <div className="w-full h-full relative group/modal-player">
                                <video
                                    src={modalVideoUrl}
                                    className="w-full h-full object-cover"
                                    autoPlay
                                    loop
                                    controls
                                />
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-slate-50 dark:bg-white/5">
                                <div className="space-y-4 opacity-30 text-slate-900 dark:text-white">
                                    <div className="w-16 h-16 bg-slate-200 dark:bg-white/5 rounded-3xl flex items-center justify-center mx-auto">
                                        <AlertCircle className="w-8 h-8" />
                                    </div>
                                    <h3 className="font-bold text-[10px] uppercase tracking-widest">Video Not Ready</h3>
                                    <button onClick={() => setSelectedProject(null)} className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Back to Studio</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Quota Exhausted Modal */}
            {showQuotaModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-md bg-white dark:bg-[#0c0c12] border border-slate-200 dark:border-white/10 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-500 animate-[shimmer_2s_infinite]" />
                        <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <ShieldAlert className="w-10 h-10 text-orange-500" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white italic uppercase tracking-tighter mb-4">System Overload</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8">
                            {quotaMessage || "We are currently experiencing extremely high demand. To ensure quality for everyone, we have temporarily paused new generations."}
                        </p>
                        <button
                            onClick={() => setShowQuotaModal(false)}
                            className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl transition-all text-sm uppercase tracking-widest shadow-lg shadow-orange-600/20"
                        >
                            Understood
                        </button>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-lg bg-white dark:bg-[#0c0c12] border border-slate-200 dark:border-white/10 rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <button
                            onClick={() => setShowPaymentModal(false)}
                            className="absolute top-6 right-6 p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 transition-colors z-[210]"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="text-center mb-8 shrink-0">
                            <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Zap className="w-8 h-8 text-orange-500 fill-orange-500" />
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white italic uppercase tracking-tighter">Fuel Your Production</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Get back to creating high-converting ads</p>
                        </div>

                        {!checkoutSessionId ? (
                            <div className="grid grid-cols-2 gap-4 w-full mb-8">
                                {[
                                    { id: 'pack_3', credits: 3, price: 6, label: 'Starter' },
                                    { id: 'pack_5', credits: 5, price: 10, label: 'Standard' },
                                    { id: 'pack_12', credits: 12, price: 20, label: 'Pro', popular: true },
                                    { id: 'pack_18', credits: 18, price: 30, label: 'Agency' },
                                ].map((pkg) => (
                                    <button
                                        key={pkg.id}
                                        onClick={() => handleBuyCredits(pkg.id)}
                                        className={`relative p-6 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl text-left hover:border-orange-500/50 hover:bg-slate-100 dark:hover:bg-white/10 transition-all group ${pkg.popular ? 'border-orange-500/40 bg-orange-600/5 dark:bg-orange-500/10' : ''}`}
                                    >
                                        <div className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">{pkg.label}</div>
                                        <div className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tighter mb-4">${pkg.price}</div>
                                        <div className="text-xl font-black text-orange-600 dark:text-orange-500 italic">{pkg.credits} CREDITS</div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0 bg-white rounded-2xl overflow-hidden relative">
                                <WhopCheckoutEmbed
                                    sessionId={checkoutSessionId}
                                    onCheckoutComplete={() => {
                                        setShowPaymentModal(false);
                                        window.location.reload();
                                    }}
                                />
                            </div>
                        )}

                        <p className="text-[10px] text-slate-600 dark:text-slate-500 text-center uppercase tracking-widest font-bold mt-6 opacity-30">
                            Secure Payment via Whop Cloud
                        </p>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {projectToDelete && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-sm bg-white dark:bg-[#0c0c12] border border-slate-200 dark:border-white/10 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                            <Trash2 className="w-8 h-8 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white italic uppercase tracking-tighter mb-2">Delete Project?</h2>
                        <p className="text-slate-500 text-sm font-medium mb-8">This action cannot be undone. All footage and scripts will be permanently removed.</p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={confirmDelete}
                                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all text-sm uppercase tracking-widest shadow-lg shadow-red-600/20"
                            >
                                Delete Permanently
                            </button>
                            <button
                                onClick={() => setProjectToDelete(null)}
                                className="w-full py-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 font-bold rounded-xl transition-all text-sm uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,115,0,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,115,0,0.3); }
        
        @keyframes progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(250%); }
        }
        
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
      `
            }} />
        </div>
    );
}

export default App;
