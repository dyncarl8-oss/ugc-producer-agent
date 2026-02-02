'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Play, Loader2, Key, ShieldAlert, Smartphone, Sparkles, User, Box, ShoppingBag, Clapperboard, CheckCircle2, AlertCircle, Layers, RefreshCcw, Download, Zap, Plus, CreditCard, ChevronRight, X, Trash2, Menu, PanelLeft, ChevronLeft } from 'lucide-react';
import { AdVibe, AspectRatio, Config, GenerationStatus } from '../types';
import { VeoService, Shot } from '../services/veoService';
import { CustomVideoPlayer } from './components/CustomVideoPlayer';
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
            <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)] text-orange-500">
                <Loader2 className="w-12 h-12 animate-spin" />
            </div>
        );
    }

    if (!user && status.stage !== 'generating') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-8 text-center">
                <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-orange-500/20">
                    <ShieldAlert className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 italic">Security Checkpoint</h2>
                <p className="text-[var(--text-muted)] max-w-md mx-auto mb-8 font-medium">Please open UGC Producer Agent through the Whop Dashboard to authenticate your session.</p>
                <div className="flex gap-4">
                    <a href="https://whop.com" className="bg-orange-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-sm hover:bg-orange-500 transition-all">Go to Whop</a>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans overflow-hidden relative">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-80 bg-[var(--bg-secondary)] border-r border-[var(--border-secondary)] flex flex-col p-6 overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'}`}>
                <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                            <Clapperboard className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">UGC Producer</h1>
                            <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest leading-none">UGC Producer Agent</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsSidebarOpen(false)}
                            className="p-1.5 hover:bg-[var(--bg-card-hover)] rounded-lg transition-all text-[var(--text-muted)] hover:text-orange-500"
                            title="Hide Sidebar"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {user && (
                    <div className="mb-8 p-4 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl flex flex-col gap-4">
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
                                <User className="w-6 h-6 text-orange-400" />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-black text-[var(--text-primary)] tracking-tight truncate">{user.username}</span>
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-[var(--orange-muted)] border border-[var(--border-accent)] rounded-full shrink-0">
                                        <Zap className="w-2.5 h-2.5 text-[var(--orange-bright)] fill-[var(--orange-bright)]" />
                                        <span className="text-[10px] text-[var(--orange-bright)] font-black tracking-tighter">{user.credits}</span>
                                    </div>
                                </div>
                                <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-0.5">Verified Account</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowPaymentModal(true)}
                            className="w-full py-2.5 bg-[var(--orange-primary)] hover:bg-[var(--orange-bright)] rounded-xl flex items-center justify-center gap-2 transition-all group shadow-lg shadow-orange-600/20"
                        >
                            <Plus className="w-3.5 h-3.5 text-[var(--text-on-orange)] group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-[var(--text-on-orange)] uppercase tracking-widest">Top Up Credits</span>
                        </button>
                    </div>
                )}

                <div className="flex-1">
                    <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mb-3 ml-2">Recent Projects</div>
                    <div className="space-y-3">
                        {projects.length === 0 ? (
                            <div className="p-4 border border-dashed border-[var(--border-primary)] rounded-2xl text-center">
                                <p className="text-[10px] text-[var(--text-muted)] font-medium">No projects yet</p>
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
                                    className="p-3 bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-xl hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer group relative"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold text-[var(--text-secondary)] truncate max-w-[120px]">{p.vibe}</span>
                                        <button
                                            onClick={(e) => handleDeleteProject(e, p.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded-md transition-all text-[var(--text-muted)] hover:text-red-500"
                                            title="Delete Project"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                                        {new Date(p.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="pt-6 border-t border-[var(--border-secondary)] space-y-3" />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col p-4 lg:p-8 overflow-y-auto items-center relative transition-all duration-300">
                <div className="max-w-5xl w-full flex flex-col gap-6 lg:gap-10">
                    {/* Integrated Top Navigation (Full-width when sidebar hidden) */}
                    {!isSidebarOpen && (
                        <div className="flex items-center justify-between pb-6 border-b border-[var(--border-secondary)]/50 mb-2 animate-in fade-in slide-in-from-top-4 duration-500">
                            {/* Left: Branding & Toggle */}
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="p-1.5 text-[var(--text-muted)] hover:text-orange-500 transition-colors"
                                    title="Show Sidebar"
                                >
                                    <Menu className="w-6 h-6" />
                                </button>

                                <div className="hidden sm:flex items-center gap-3 ml-2 group cursor-default">
                                    <div className="w-9 h-9 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-105 transition-transform">
                                        <Clapperboard className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="hidden sm:block">
                                        <h1 className="text-sm font-bold tracking-tight leading-none text-[var(--text-primary)]">UGC Producer</h1>
                                        <span className="text-[9px] text-orange-400 font-bold uppercase tracking-[0.15em] leading-none mt-1 block">Studio Agent</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right: User Stats & Top Up */}
                            {user && (
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 group">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-full shadow-sm hover:border-orange-500/30 transition-all">
                                            <Zap className="w-3.5 h-3.5 text-orange-500 fill-orange-500 group-hover:animate-pulse" />
                                            <span className="text-[11px] font-black text-[var(--text-primary)] tracking-tight">{user.credits}</span>
                                        </div>
                                        <button
                                            onClick={() => setShowPaymentModal(true)}
                                            className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-600/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                                        >
                                            <Plus className="w-3 h-3 text-white" />
                                            <span>Top Up</span>
                                        </button>
                                    </div>

                                    <div className="w-9 h-9 rounded-full border-2 border-orange-500/20 overflow-hidden shadow-inner bg-[var(--bg-card)]">
                                        {user.profile_pic_url ? (
                                            <img src={user.profile_pic_url} alt={user.username} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <User className="w-5 h-5 text-orange-500/40" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}



                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 lg:gap-16 items-start transition-all duration-500">
                        {/* 3 Step Flow */}
                        <div className="space-y-10">
                            {/* Horizontal Layout for Step 1 & 2 when Expanded */}
                            <div className={`grid grid-cols-1 ${!isSidebarOpen ? 'md:grid-cols-2' : ''} gap-8`}>
                                {/* Step 1: Upload */}
                                <section className="space-y-4">
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                                        <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">01</span>
                                        Upload Product
                                    </label>
                                    <label className={`flex flex-col items-center justify-center w-full aspect-square max-h-[160px] rounded-[32px] border-2 border-dashed transition-all cursor-pointer ${productImage ? 'border-orange-500/40 bg-orange-500/5' : 'border-[var(--border-primary)] hover:border-orange-500/30 bg-[var(--bg-card)] shadow-inner'
                                        }`}>
                                        {productImage ? (
                                            <img src={productImage} alt="Product" className="w-full h-full object-contain p-6" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-3 opacity-20 group">
                                                <ShoppingBag className="w-8 h-8 group-hover:scale-110 transition-transform" />
                                                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Drop Item</span>
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
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                                        <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">02</span>
                                        Set Vibe
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.values(AdVibe).map((v) => (
                                            <button
                                                key={v}
                                                onClick={() => setVibe(v)}
                                                className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${vibe === v
                                                    ? 'bg-[var(--orange-primary)] border-[var(--orange-bright)] text-[var(--text-on-orange)] shadow-lg'
                                                    : 'bg-[var(--bg-card)] border-[var(--border-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                                                    }`}
                                            >
                                                <span className="font-bold text-[9px] uppercase tracking-tight">{v}</span>
                                                {vibe === v && <CheckCircle2 className="w-3 h-3 text-[var(--text-on-orange)]" />}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            </div>

                            {/* Step 3: Template */}
                            <section className="space-y-4">
                                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 bg-[var(--orange-primary)] rounded-md text-[var(--text-on-orange)] flex items-center justify-center text-[9px] font-black italic">03</span>
                                    Select Template
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 relative">
                                    {[1, 2, 3, 4, 5, 6].map((num) => {
                                        const path = `/templates/template${num}.png`;
                                        return (
                                            <button
                                                key={num}
                                                onClick={() => setSelectedTemplate(path)}
                                                onMouseEnter={() => setHoveredTemplate(path)}
                                                onMouseLeave={() => setHoveredTemplate(null)}
                                                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedTemplate === path ? 'border-[var(--orange-primary)] scale-95 shadow-lg shadow-orange-500/20' : 'border-[var(--border-secondary)] opacity-40 hover:opacity-100 hover:border-[var(--border-primary)]'}`}
                                            >
                                                <img src={path} className="w-full h-full object-cover" alt={`Template ${num}`} />
                                            </button>
                                        );
                                    })}

                                    {/* Hover Preview Overlay - Desktop Only */}
                                    {hoveredTemplate && (
                                        <div className="hidden lg:block absolute bottom-full mb-4 left-0 z-50 pointer-events-none animate-in fade-in zoom-in duration-200">
                                            <div className="w-48 aspect-[9/16] rounded-3xl overflow-hidden border-4 border-[var(--orange-primary)] shadow-[0_0_50px_var(--shadow-accent)] bg-[var(--bg-tertiary)]">
                                                <img src={hoveredTemplate} className="w-full h-full object-cover" alt="Preview" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <div className="pt-4">
                                <button
                                    onClick={handleGenerateFullAd}
                                    disabled={!productImage || status.stage === 'generating'}
                                    className={`w-full py-6 rounded-3xl font-black text-xl uppercase italic tracking-tighter transition-all flex items-center justify-center gap-4 ${!productImage || status.stage === 'generating'
                                        ? 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-primary)] cursor-not-allowed opacity-50'
                                        : 'bg-[var(--orange-primary)] text-[var(--text-on-orange)] hover:bg-[var(--orange-bright)] hover:scale-[1.01] shadow-[0_20px_40px_var(--shadow-accent)]'
                                        }`}
                                >
                                    {status.stage === 'generating' ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <Play className="w-6 h-6 fill-current" />
                                    )}
                                    <span>{status.stage === 'generating' ? status.message : 'START GENERATION'}</span>
                                    {status.stage !== 'generating' && (
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--orange-muted)] rounded-full border border-[var(--border-accent)] shrink-0">
                                            <Zap className="w-3.5 h-3.5 text-[var(--text-on-orange)] fill-[var(--text-on-orange)]" />
                                            <span className="text-xs font-black tracking-normal italic text-[var(--text-on-orange)]">1</span>
                                        </div>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Viewfinder Column */}
                        <div className="flex flex-col items-center w-full max-w-[340px] mx-auto lg:max-w-none">
                            <div className="w-full aspect-[9/16] bg-[var(--phone-bg)] rounded-[32px] sm:rounded-[48px] border-[8px] sm:border-[12px] border-[var(--phone-border)] shadow-[0_0_100px_var(--shadow-color)] overflow-hidden relative">

                                {masterVideoUrl ? (
                                    <div className="w-full h-full relative group/player">
                                        <CustomVideoPlayer
                                            src={masterVideoUrl}
                                            className="w-full h-full"
                                        />

                                        {/* Custom HUD: Top Right Download */}
                                        <div className="absolute top-6 right-6 z-50">
                                            <button
                                                onClick={downloadMasterAd}
                                                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-tighter shadow-xl shadow-orange-500/40 transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
                                            >
                                                <Download className="w-3 h-3" />
                                                Download
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-primary)]">
                                        {status.stage === 'generating' ? (
                                            <div className="space-y-8 w-full max-w-[240px]">
                                                <div className="relative">
                                                    <div className="flex items-center justify-center">
                                                        <Loader2 className="w-20 h-20 animate-spin text-orange-500/10 absolute" />
                                                        <div className="w-16 h-16 rounded-full border-2 border-orange-500/20 flex items-center justify-center">
                                                            <span className="text-xl font-black text-orange-500 italic">{status.progress || 0}%</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <span className="text-orange-400 font-black tracking-tighter text-lg italic uppercase animate-pulse leading-none block">{status.message}</span>
                                                    <div className="space-y-1">
                                                        <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-[0.2em] block">Don't close this tab while we produce your ad (5-10 mins)</span>
                                                        <div className="w-full h-1 bg-[var(--bg-card)] rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-orange-600 transition-all duration-1000"
                                                                style={{ width: `${status.progress || 0}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="opacity-10 group">
                                                <Smartphone className="w-16 h-16 mb-4 mx-auto group-hover:scale-110 transition-transform duration-500" />
                                                <span className="text-[10px] font-black uppercase tracking-[0.4em]">Empty Studio</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {status.stage === 'error' && (
                                <div className="mt-6 w-full p-4 bg-red-950/20 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-[10px] uppercase tracking-widest mb-1">Production Error</h4>
                                        <p className="text-[9px] leading-relaxed opacity-70">{status.message}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* High Demand / Quota Modal */}
            {showQuotaModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-md bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />

                        <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
                            <Layers className="w-8 h-8 text-blue-400" />
                        </div>

                        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">System Overload</h2>
                        <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-8">
                            {quotaMessage || "We are currently experiencing extremely high demand. To ensure quality for everyone, we have temporarily paused new generations."}
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => setShowQuotaModal(false)}
                                className="w-full py-4 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-500 transition-all text-sm uppercase tracking-widest"
                            >
                                Understood
                            </button>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mt-2">Please try again tomorrow</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Video Modal */}
            {selectedProject && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12 bg-[var(--bg-overlay)] backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="relative h-full max-h-[85vh] aspect-[9/16] bg-[var(--phone-bg)] rounded-[48px] border-[12px] border-[var(--phone-border)] shadow-[0_0_100px_var(--shadow-color)] overflow-hidden">

                        {/* Modal Header */}
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
                                <CustomVideoPlayer
                                    src={modalVideoUrl}
                                    className="w-full h-full"
                                />
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-gradient-to-b from-[var(--bg-tertiary)] to-[var(--bg-primary)]">
                                <div className="space-y-4 opacity-30">
                                    <div className="w-16 h-16 bg-[var(--bg-card)] rounded-3xl flex items-center justify-center mx-auto">
                                        <AlertCircle className="w-8 h-8 text-[var(--text-primary)]" />
                                    </div>
                                    <div>
                                        <h3 className="text-[var(--text-primary)] font-bold text-[10px] uppercase tracking-widest">Video Not Ready</h3>
                                        <p className="text-[var(--text-muted)] text-[9px] mt-1 italic">This generation may have been interrupted or the file is still uploading.</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedProject(null)}
                                        className="text-[10px] font-bold text-orange-500 uppercase tracking-widest hover:text-orange-400"
                                    >
                                        Back to Studio
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}




            {/* Payment Modal */}
            {showPaymentModal && (
                <>
                    {checkoutSessionId ? (
                        <div className="fixed inset-0 z-[200] bg-[var(--bg-overlay)] backdrop-blur-sm animate-in fade-in duration-300 flex items-center justify-center p-4">
                            <div className="w-full max-w-md bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh] animate-in zoom-in-95 duration-300">
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-[var(--border-secondary)] flex justify-between items-center bg-[var(--bg-tertiary)] shrink-0">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                                            <Zap className="w-4 h-4 text-white fill-white" />
                                        </div>
                                        <span className="text-sm font-black text-[var(--text-primary)] uppercase tracking-wide">Secure Checkout</span>
                                    </div>
                                    <button
                                        onClick={() => { setShowPaymentModal(false); setCheckoutSessionId(null); setCheckoutPurchaseUrl(null); }}
                                        className="transition-colors text-white/20 hover:text-white"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Embed Container */}
                                <div className="flex-1 bg-gray-50 relative overflow-y-auto light-scrollbar">
                                    <WhopCheckoutEmbed
                                        key={checkoutSessionId}
                                        sessionId={checkoutSessionId}
                                        returnUrl={typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ""}
                                        onComplete={async (paymentId) => {
                                            console.log("Checkout complete! Verifying Payment ID:", paymentId);
                                            try {
                                                const res = await fetch('/api/payments/verify', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        paymentId,
                                                        packageId: selectedPackageId
                                                    })
                                                });
                                                const data = await res.json();

                                                if (data.success) {
                                                    console.log("Credits added successfully!");
                                                    setShowPaymentModal(false);
                                                    setCheckoutSessionId(null);
                                                    setCheckoutPurchaseUrl(null);
                                                    window.location.reload();
                                                } else {
                                                    console.error("Payment verification failed:", data.error);
                                                    // Optional: Show error to user
                                                    alert("Payment verification failed. Please contact support if you were charged.");
                                                }
                                            } catch (err) {
                                                console.error("Error calling verify API:", err);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="fixed inset-0 z-[200] overflow-y-auto bg-[var(--bg-overlay)] backdrop-blur-xl animate-in fade-in duration-300">
                            <div className="flex min-h-full items-center justify-center p-4 sm:p-6 py-12">
                                <div className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-[32px] sm:rounded-[40px] w-full max-w-xl shadow-2xl relative overflow-hidden">
                                    <div className="p-6 sm:p-8 pb-4 flex flex-col items-center text-center relative">
                                        <button
                                            onClick={() => { setShowPaymentModal(false); setCheckoutSessionId(null); }}
                                            className="absolute top-6 right-6 transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>

                                        <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-500/20">
                                            <Zap className="w-8 h-8 text-white fill-white" />
                                        </div>
                                        <h2 className="text-3xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter mb-2">Fuel Your Production</h2>
                                        <p className="text-[var(--text-muted)] text-sm font-medium mb-10 max-w-md">Select a credit package to start generating high-converting viral UGC ads.</p>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                                            {[
                                                { id: 'pack_3', credits: 3, price: 6, label: 'Starter' },
                                                { id: 'pack_5', credits: 5, price: 10, label: 'Standard' },
                                                { id: 'pack_12', credits: 12, price: 20, label: 'Pro', popular: true },
                                                { id: 'pack_18', credits: 18, price: 30, label: 'Agency' },
                                            ].map((pkg) => (
                                                <button
                                                    key={pkg.id}
                                                    onClick={() => handleBuyCredits(pkg.id)}
                                                    disabled={loadingCheckout}
                                                    className={`relative p-6 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl text-left hover:border-orange-500/50 hover:bg-[var(--bg-card-hover)] transition-all group ${pkg.popular ? 'border-orange-500/40 bg-orange-600/5' : ''}`}
                                                >
                                                    {pkg.popular && (
                                                        <div className="absolute top-4 right-4 bg-orange-600 px-2 py-0.5 rounded-full">
                                                            <span className="text-[8px] font-black text-white uppercase tracking-widest">Popular</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pkg.popular ? 'bg-orange-600 text-white' : 'bg-[var(--bg-card)] text-[var(--text-secondary)]'}`}>
                                                            <Zap className={`w-5 h-5 ${pkg.popular ? 'fill-white' : ''}`} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest leading-none mb-1">{pkg.label}</h3>
                                                            <span className="text-2xl font-black text-[var(--text-primary)] italic tracking-tighter">${pkg.price}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xl font-black text-[var(--orange-bright)] italic">{pkg.credits} CREDITS</span>
                                                        <div className="w-8 h-8 rounded-full bg-[var(--bg-card)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <ChevronRight className="w-4 h-4 text-orange-500" />
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {loadingCheckout && (
                                            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-10 rounded-[40px]">
                                                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 bg-[var(--bg-card)] border-t border-[var(--border-secondary)] text-center">
                                        <p className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-[0.2em]">Secure payments powered by Whop</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Delete Confirmation Modal */}
            {projectToDelete && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-[var(--bg-overlay)] backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="w-full max-w-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                            <Trash2 className="w-8 h-8 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter mb-2">Delete Project?</h2>
                        <p className="text-[var(--text-muted)] text-sm font-medium mb-8">This action cannot be undone. All footage and scripts will be permanently removed.</p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={confirmDelete}
                                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all text-sm uppercase tracking-widest shadow-lg shadow-red-600/20"
                            >
                                Delete Permanently
                            </button>
                            <button
                                onClick={() => setProjectToDelete(null)}
                                className="w-full py-4 bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] font-bold rounded-xl transition-all text-sm uppercase tracking-widest"
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
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        
        .light-scrollbar::-webkit-scrollbar { width: 4px; }
        .light-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .light-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 10px; }
        .light-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.3); }
      `}} />
        </div >
    );
};

export default App;
