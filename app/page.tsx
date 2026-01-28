'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Play, Loader2, Key, ShieldAlert, Smartphone, Sparkles, User, Box, ShoppingBag, Clapperboard, CheckCircle2, AlertCircle, Layers, RefreshCcw, Download, Zap, Plus, CreditCard, ChevronRight } from 'lucide-react';
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
    const [loadingCheckout, setLoadingCheckout] = useState(false);

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

        } catch (error) {
            console.error('FFmpeg Error:', error);
            throw new Error('Failed to stitch videos together.');
        }
    };

    const handleGenerateFullAd = async () => {
        if (!productImage || !avatarImage) {
            setStatus({ stage: 'error', message: 'Please upload a product image first.' });
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
            setStatus({ stage: 'generating', message: 'Drafting viral ad script...', progress: 15 });
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
                    message: `Generating footage (${i + 1}/${totalShots})...`,
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
                }, config.simulateMode);

                completedVideoUrls.push(videoUrl);
                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'completed', videoUrl } : s));

                // Update shot in DB
                await fetch('/api/campaign', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'updateShot',
                        campaignId: newCampaignId,
                        data: { type: shot.type, status: 'completed', videoUrl, refImage: refImg }
                    })
                });

                // Add 65-second breathing room for the API before next shot
                if (i < generatedShots.length - 1) {
                    setStatus({
                        stage: 'generating',
                        message: `Applying post-processing...`,
                        progress: Math.round(shotProgressBase + ((i + 0.5) / totalShots) * shotProgressRange)
                    });
                    await new Promise(res => setTimeout(res, 65000));
                }
            }

            // 3. Final Stitching
            setStatus({ stage: 'generating', message: 'Merging final cinematic cut...', progress: 95 });
            await concatenateVideos(completedVideoUrls);

            // Finish campaign in DB
            await fetch('/api/campaign', {
                method: 'POST',
                body: JSON.stringify({ action: 'finishCampaign', campaignId: newCampaignId, data: { masterVideoUrl: 'Saved' } })
            });

            setStatus({ stage: 'completed', message: 'Ad campaign ready!', progress: 100 });
            setCurrentShotId(null);
        } catch (error: any) {
            console.error("Studio Error:", error);

            if (error.message?.includes("Requested entity was not found")) {
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
            <div className="flex items-center justify-center h-screen bg-[#030305] text-orange-500">
                <Loader2 className="w-12 h-12 animate-spin" />
            </div>
        );
    }

    if (!user && status.stage !== 'generating') {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-[#030305] text-slate-100 p-8 text-center">
                <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-orange-500/20">
                    <ShieldAlert className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 italic">Security Checkpoint</h2>
                <p className="text-slate-500 max-w-md mx-auto mb-8 font-medium">Please open UGC Producer Agent through the Whop Dashboard to authenticate your session.</p>
                <div className="flex gap-4">
                    <a href="https://whop.com" className="bg-white text-black px-8 py-3 rounded-2xl font-black uppercase text-sm hover:bg-slate-200 transition-all">Go to Whop</a>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#030305] text-slate-100 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-80 bg-[#07070a] border-r border-white/5 flex flex-col p-6 overflow-y-auto">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                        <Clapperboard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight">UGC Producer</h1>
                        <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest leading-none">AI Agent Studio</span>
                    </div>
                </div>

                {user && (
                    <div className="mb-8 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col gap-4">
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
                                    <span className="text-sm font-black text-white tracking-tight truncate">{user.username}</span>
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-600/20 border border-orange-500/30 rounded-full shrink-0">
                                        <Zap className="w-2.5 h-2.5 text-orange-500 fill-orange-500" />
                                        <span className="text-[10px] text-orange-200 font-black tracking-tighter">{user.credits}</span>
                                    </div>
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Verified Account</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowPaymentModal(true)}
                            className="w-full py-2.5 bg-orange-600/10 border border-orange-500/20 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-600/20 transition-all group"
                        >
                            <Plus className="w-3.5 h-3.5 text-orange-500 group-hover:scale-110 transition-transform" />
                            <span className="text-[10px] font-black text-orange-200 uppercase tracking-widest">Top Up Credits</span>
                        </button>
                    </div>
                )}

                <div className="flex-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 ml-2">Recent Projects</div>
                    <div className="space-y-3">
                        {projects.length === 0 ? (
                            <div className="p-4 border border-dashed border-white/10 rounded-2xl text-center">
                                <p className="text-[10px] text-slate-600 font-medium">No projects yet</p>
                            </div>
                        ) : (
                            projects.slice(0, 8).map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => {
                                        setSelectedProject(p);
                                        // If the master video exists in the DB, it's 'Saved', but we need the actual blob for the player
                                        // Since blobs are session based, we check if this p.id matches our current campaign
                                        if (p.id === campaignId && masterVideoUrl) {
                                            setModalVideoUrl(masterVideoUrl);
                                        } else if (p.master_video_url && p.master_video_url.startsWith('blob:')) {
                                            setModalVideoUrl(p.master_video_url);
                                        } else {
                                            setModalVideoUrl(null);
                                        }
                                    }}
                                    className="p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all cursor-pointer group"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold text-slate-400 truncate max-w-[120px]">{p.vibe}</span>
                                        <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'completed' ? 'bg-green-500' : 'bg-orange-500'}`} />
                                    </div>
                                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
                                        {new Date(p.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="pt-6 border-t border-white/5 space-y-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-3 rounded-xl border border-white/5 text-[10px] font-bold text-slate-500 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCcw className="w-3 h-3" /> RESET STUDIO
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col p-8 overflow-y-auto items-center">
                <div className="max-w-5xl w-full flex flex-col gap-10">

                    <div className="text-center space-y-3">
                        <h2 className="text-6xl font-black text-white tracking-tighter italic uppercase leading-none">UGC Producer</h2>
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
                                <label className={`flex flex-col items-center justify-center w-full aspect-square max-h-[160px] rounded-[32px] border-2 border-dashed transition-all cursor-pointer ${productImage ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/10 hover:border-orange-500/30 bg-white/5 shadow-inner'
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
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">02</span>
                                    Set Vibe
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.values(AdVibe).map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setVibe(v)}
                                            className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${vibe === v
                                                ? 'bg-orange-600 border-orange-400 text-white shadow-lg'
                                                : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                                                }`}
                                        >
                                            <span className="font-bold text-[9px] uppercase tracking-tight">{v}</span>
                                            {vibe === v && <CheckCircle2 className="w-3 h-3 text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Step 3: Template */}
                            <section className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-5 h-5 bg-orange-600 rounded-md text-white flex items-center justify-center text-[9px] font-black italic">03</span>
                                    Select Template
                                </label>
                                <div className="grid grid-cols-6 gap-2 relative">
                                    {[1, 2, 3, 4, 5, 6].map((num) => {
                                        const path = `/templates/template${num}.png`;
                                        return (
                                            <button
                                                key={num}
                                                onClick={() => setSelectedTemplate(path)}
                                                onMouseEnter={() => setHoveredTemplate(path)}
                                                onMouseLeave={() => setHoveredTemplate(null)}
                                                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedTemplate === path ? 'border-orange-500 scale-95 shadow-lg shadow-orange-500/20' : 'border-white/5 opacity-40 hover:opacity-100 hover:border-white/20'}`}
                                            >
                                                <img src={path} className="w-full h-full object-cover" alt={`Template ${num}`} />
                                            </button>
                                        );
                                    })}

                                    {/* Hover Preview Overlay */}
                                    {hoveredTemplate && (
                                        <div className="absolute bottom-full mb-4 left-0 z-50 pointer-events-none animate-in fade-in zoom-in duration-200">
                                            <div className="w-48 aspect-[9/16] rounded-3xl overflow-hidden border-4 border-orange-600 shadow-[0_0_50px_rgba(255,77,0,0.3)] bg-black">
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
                                        ? 'bg-white/5 text-slate-700 cursor-not-allowed'
                                        : 'bg-orange-600 text-white hover:bg-orange-500 hover:scale-[1.01] shadow-[0_20px_40px_rgba(255,77,0,0.25)]'
                                        }`}
                                >
                                    {status.stage === 'generating' ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <Play className="w-6 h-6 fill-current" />
                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full border border-white/10 shrink-0">
                                                <Zap className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                                                <span className="text-xs font-black tracking-normal italic">1</span>
                                            </div>
                                        </div>
                                    )}
                                    {status.stage === 'generating' ? status.message : 'START GENERATION'}
                                </button>
                            </div>
                        </div>

                        {/* Viewfinder Column */}
                        <div className="flex flex-col items-center">
                            <div className="w-full aspect-[9/16] bg-[#0c0c12] rounded-[48px] border-[12px] border-[#16161c] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden relative">

                                {masterVideoUrl ? (
                                    <div className="w-full h-full relative group/player">
                                        <video
                                            id="main-video-player"
                                            src={masterVideoUrl}
                                            className="w-full h-full object-cover"
                                            autoPlay
                                            loop
                                            controls={false}
                                            onClick={(e) => {
                                                const v = e.currentTarget;
                                                if (v.paused) v.play();
                                                else v.pause();
                                            }}
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

                                        {/* Custom Player Controls */}
                                        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/player:opacity-100 transition-opacity duration-300 pointer-events-none">
                                            <div className="flex flex-col gap-3 pointer-events-auto">
                                                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer relative group/progress" onClick={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const pos = (e.clientX - rect.left) / rect.width;
                                                    const v = document.getElementById('main-video-player') as HTMLVideoElement;
                                                    if (v) v.currentTime = pos * v.duration;
                                                }}>
                                                    <div
                                                        id="video-progress-bar"
                                                        className="absolute inset-y-0 left-0 bg-orange-600 rounded-full"
                                                        style={{ width: '0%' }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <button
                                                        className="text-white hover:text-orange-400 transition-colors"
                                                        onClick={() => {
                                                            const v = document.getElementById('main-video-player') as HTMLVideoElement;
                                                            if (v) {
                                                                if (v.paused) v.play();
                                                                else v.pause();
                                                            }
                                                        }}
                                                    >
                                                        <Play className="w-4 h-4 fill-current" />
                                                    </button>
                                                    <span className="text-[10px] font-bold text-white/50 tracking-widest">VEOS VIDEO PLAYER</span>
                                                </div>
                                            </div>
                                        </div>

                                        <script dangerouslySetInnerHTML={{
                                            __html: `
                                            setInterval(() => {
                                                const v = document.getElementById('main-video-player');
                                                const bar = document.getElementById('video-progress-bar');
                                                if (v && bar) {
                                                    const pct = (v.currentTime / v.duration) * 100;
                                                    bar.style.width = pct + '%';
                                                }
                                            }, 100);
                                        `}} />
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-gradient-to-b from-[#0c0c12] to-[#050508]">
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
                                                        <span className="text-[8px] text-slate-500 font-bold uppercase tracking-[0.2em] block">Please wait ~5-7 minutes</span>
                                                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
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

            {/* Video Modal */}
            {selectedProject && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="relative w-full max-w-sm aspect-[9/16] bg-[#0c0c12] rounded-[48px] border-[12px] border-[#16161c] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden">

                        {/* Modal Header */}
                        <div className="absolute top-8 left-8 right-8 z-[110] flex items-center justify-between pointer-events-none">
                            <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{selectedProject.vibe}</span>
                            </div>
                            <button
                                onClick={() => setSelectedProject(null)}
                                className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center border border-white/10 transition-all pointer-events-auto"
                            >
                                <RefreshCcw className="w-4 h-4 text-white rotate-45" />
                            </button>
                        </div>

                        {modalVideoUrl ? (
                            <div className="w-full h-full relative group/modal-player">
                                <video
                                    id="modal-video-player"
                                    src={modalVideoUrl}
                                    className="w-full h-full object-cover"
                                    autoPlay
                                    loop
                                    onClick={(e) => {
                                        const v = e.currentTarget;
                                        if (v.paused) v.play();
                                        else v.pause();
                                    }}
                                />

                                {/* Replay Button */}
                                <button
                                    onClick={() => {
                                        const v = document.getElementById('modal-video-player') as HTMLVideoElement;
                                        if (v) {
                                            v.currentTime = 0;
                                            v.play();
                                        }
                                    }}
                                    className="absolute bottom-24 right-8 z-[110] w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 transition-all"
                                >
                                    <RefreshCcw className="w-5 h-5 text-white" />
                                </button>

                                {/* Download Button */}
                                <button
                                    onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = modalVideoUrl;
                                        a.download = `ugc-video-${selectedProject.id}.mp4`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                    }}
                                    className="absolute bottom-8 left-8 right-8 z-[110] bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-500/40 transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Video
                                </button>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center bg-gradient-to-b from-[#0c0c12] to-[#050508]">
                                <div className="space-y-4 opacity-30">
                                    <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mx-auto">
                                        <AlertCircle className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold text-[10px] uppercase tracking-widest">Video Unavailable</h3>
                                        <p className="text-slate-500 text-[9px] mt-1 italic">Historical session data is restricted to live previews only.</p>
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
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-[#0c0c12] border border-white/10 rounded-[40px] w-full max-w-2xl overflow-hidden shadow-2xl">
                        <div className="p-8 flex flex-col items-center text-center relative">
                            <button
                                onClick={() => { setShowPaymentModal(false); setCheckoutSessionId(null); }}
                                className="absolute top-6 right-6 w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center border border-white/10 transition-all"
                            >
                                <RefreshCcw className="w-4 h-4 text-white rotate-45" />
                            </button>

                            <div className="w-16 h-16 bg-orange-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-500/20">
                                <Zap className="w-8 h-8 text-white fill-white" />
                            </div>
                            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">Fuel Your Production</h2>
                            <p className="text-slate-500 text-sm font-medium mb-10 max-w-md">Select a credit package to start generating high-converting viral UGC ads.</p>

                            {checkoutSessionId ? (
                                <div className="w-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="w-full h-[550px] overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-2xl relative group">
                                        <WhopCheckoutEmbed
                                            key={checkoutSessionId}
                                            sessionId={checkoutSessionId}
                                            returnUrl={typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ""}
                                            onComplete={(paymentId) => {
                                                console.log("Checkout complete! Payment ID:", paymentId);
                                                setShowPaymentModal(false);
                                                setCheckoutSessionId(null);
                                                setCheckoutPurchaseUrl(null);
                                                window.location.reload();
                                            }}
                                        />

                                        {/* Overlay helper if iframe is blocked */}
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-active:opacity-0 transition-opacity">
                                            <p className="text-[10px] text-white/5 font-medium uppercase tracking-[0.5em]">Secure Checkout Loading</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-3xl flex flex-col items-center gap-3 backdrop-blur-xl">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                                            <p className="text-[10px] text-orange-200 font-black uppercase tracking-widest">Connection blocked by browser?</p>
                                        </div>
                                        <a
                                            href={checkoutPurchaseUrl || `https://whop.com/checkout/${checkoutSessionId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-orange-950/20 active:scale-[0.98]"
                                        >
                                            <ShoppingBag className="w-4 h-4" />
                                            Complete in Secure Tab
                                        </a>
                                        <p className="text-[9px] text-orange-200/50 text-center font-medium leading-relaxed">
                                            If the window above is blank, please used the button to complete your purchase securely on Whop.com
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setCheckoutSessionId(null);
                                            setCheckoutPurchaseUrl(null);
                                        }}
                                        className="text-[10px] text-slate-500 hover:text-white transition-colors uppercase font-bold tracking-widest pt-2"
                                    >
                                        ← Back to packages
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4 w-full">
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
                                            className={`relative p-6 bg-white/5 border border-white/10 rounded-3xl text-left hover:border-orange-500/50 hover:bg-white/10 transition-all group ${pkg.popular ? 'border-orange-500/40 bg-orange-600/5' : ''}`}
                                        >
                                            {pkg.popular && (
                                                <div className="absolute top-4 right-4 bg-orange-600 px-2 py-0.5 rounded-full">
                                                    <span className="text-[8px] font-black text-white uppercase tracking-widest">Popular</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pkg.popular ? 'bg-orange-600 text-white' : 'bg-white/10 text-slate-400'}`}>
                                                    <Zap className={`w-5 h-5 ${pkg.popular ? 'fill-white' : ''}`} />
                                                </div>
                                                <div>
                                                    <h3 className="text-xs font-black text-white uppercase tracking-widest leading-none mb-1">{pkg.label}</h3>
                                                    <span className="text-2xl font-black text-white italic tracking-tighter">${pkg.price}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xl font-black text-orange-500 italic">{pkg.credits} CREDITS</span>
                                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronRight className="w-4 h-4 text-orange-500" />
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {loadingCheckout && (
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-10 rounded-[40px]">
                                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-white/5 border-t border-white/5 text-center">
                            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em]">Secure payments powered by Whop</p>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}} />
        </div>
    );
};

export default App;
