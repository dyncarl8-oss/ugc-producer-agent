'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Loader2, Key, ShieldAlert, Smartphone, Sparkles, User, Box, ShoppingBag, Clapperboard, CheckCircle2, AlertCircle, Layers, RefreshCcw, Download } from 'lucide-react';
import { AdVibe, AspectRatio, Config, GenerationStatus } from '../types';
import { VeoService, Shot } from '../services/veoService';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

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

    const ffmpegRef = useRef<any>(null);
    const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

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

        setStatus({ stage: 'generating', message: 'Initializing production...' });
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
            setStatus({ stage: 'generating', message: 'Drafting viral script...' });
            const generatedShots = await VeoService.createScript(productB64, vibe, config.simulateMode);
            setShots(generatedShots);

            // Save shots to DB
            await fetch('/api/campaign', {
                method: 'POST',
                body: JSON.stringify({ action: 'saveShots', campaignId: newCampaignId, data: { shots: generatedShots } })
            });

            const completedVideoUrls: string[] = [];

            // 2. Sequential Shot Production
            for (let i = 0; i < generatedShots.length; i++) {
                const shot = generatedShots[i];
                setCurrentShotId(shot.id);

                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'generating' } : s));
                setStatus({ stage: 'generating', message: `Pre-viz: ${shot.type}...` });

                // Generate the context-specific reference frame
                const refImg = await VeoService.generateShotReference(shot.imagePrompt, avatarImage, productImage, config.simulateMode);
                setShots(prev => prev.map(s => s.id === shot.id ? { ...s, refImage: refImg } : s));

                // Start Handheld Animation
                const videoUrl = await VeoService.animateShot(shot, refImg, (msg) => {
                    setStatus(prev => ({ ...prev, message: msg }));
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
                    setStatus({ stage: 'generating', message: 'API Cooloff (65s)...' });
                    await new Promise(res => setTimeout(res, 65000));
                }
            }

            // 3. Final Stitching
            await concatenateVideos(completedVideoUrls);

            // Finish campaign in DB
            await fetch('/api/campaign', {
                method: 'POST',
                body: JSON.stringify({ action: 'finishCampaign', campaignId: newCampaignId, data: { masterVideoUrl: 'Saved' } }) // We'll update with real URL if we had a bucket
            });

            setStatus({ stage: 'completed', message: 'Ad campaign ready!' });
            setCurrentShotId(null);
        } catch (error: any) {
            console.error("Studio Error:", error);

            // Handle the specialized API Key reset case
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
                    <div className="mb-4 p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
                        {user.profile_pic_url ? (
                            <img
                                src={user.profile_pic_url}
                                alt={user.username}
                                className="w-10 h-10 rounded-full border border-orange-500/30 object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).parentElement?.querySelector('.avatar-placeholder')?.classList.remove('hidden');
                                }}
                            />
                        ) : null}
                        <div className={`avatar-placeholder ${user.profile_pic_url ? 'hidden' : ''} w-10 h-10 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center`}>
                            <User className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-white tracking-tight leading-none mb-1 truncate max-w-[120px]">{user.username}</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Verified User</span>
                        </div>
                    </div>
                )}

                {user && (
                    <div className="mb-8 p-4 bg-orange-600/10 border border-orange-500/20 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Credits Balance</span>
                            <Sparkles className="w-3 h-3 text-orange-400" />
                        </div>
                        <div className="text-2xl font-black text-white italic">{user.credits} <span className="text-xs font-medium text-slate-500 not-italic uppercase tracking-tighter ml-1">Credits</span></div>
                    </div>
                )}

                <nav className="space-y-1 mb-10">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 ml-2">Main Menu</div>
                    <button className="w-full flex items-center gap-3 px-4 py-3 bg-orange-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-orange-500/20 transition-all">
                        <Box className="w-4 h-4" />
                        Create Ads
                    </button>
                </nav>

                <div className="flex-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 ml-2">Past Projects</div>
                    <div className="space-y-3">
                        {projects.length === 0 ? (
                            <div className="p-4 border border-dashed border-white/10 rounded-2xl text-center">
                                <p className="text-[10px] text-slate-600 font-medium">No projects yet</p>
                            </div>
                        ) : (
                            projects.slice(0, 5).map(p => (
                                <div key={p.id} className="p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all cursor-pointer group">
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

                <div className="space-y-8">
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Active Creator</label>
                            <span className="text-[10px] text-orange-400 font-bold uppercase">{selectedTemplate.split('/').pop()?.replace('.png', '')}</span>
                        </div>
                        <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-white/5 aspect-[3/4] flex items-center justify-center group shadow-2xl">
                            {avatarImage && <img src={avatarImage} alt="Host" className="w-full h-full object-cover transition-all duration-700" />}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-40" />
                            <div className="absolute bottom-4 left-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-bold text-white">READY TO RECORD</span>
                            </div>
                        </div>
                    </section>

                    <section>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 block">Pick Template</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[1, 2, 3, 4, 5, 6].map((num) => {
                                const path = `/templates/template${num}.png`;
                                return (
                                    <button
                                        key={num}
                                        onClick={() => setSelectedTemplate(path)}
                                        className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${selectedTemplate === path ? 'border-orange-500 scale-95 shadow-lg shadow-orange-500/20' : 'border-white/5 opacity-40 hover:opacity-100 hover:border-white/20'}`}
                                    >
                                        <img src={path} className="w-full h-full object-cover" alt={`Template ${num}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="p-4 bg-orange-600/5 rounded-2xl border border-orange-500/10">
                            <h4 className="text-[10px] font-bold text-orange-400 uppercase mb-2">Social Format</h4>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400">9:16 Portrait</span>
                                <Layers className="w-4 h-4 text-orange-500" />
                            </div>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-3 rounded-xl border border-white/5 text-[10px] font-bold text-slate-500 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
                        >
                            <RefreshCcw className="w-3 h-3" /> RESET STUDIO
                        </button>
                    </section>

                    {masterVideoUrl && (
                        <section className="pt-4 border-t border-white/5">
                            <button
                                onClick={downloadMasterAd}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                            >
                                <Download className="w-5 h-5" /> DOWNLOAD FINAL AD
                            </button>
                        </section>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col p-8 overflow-y-auto items-center">
                <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">

                    <div className="space-y-10">
                        <div>
                            <h2 className="text-5xl font-black text-white tracking-tighter mb-2 italic uppercase">UGC Producer Agent</h2>
                            <p className="text-slate-500 text-base">Generate authentic social ads shot-by-shot.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Box className="w-3 h-3" /> 1. Upload Product
                                </label>
                                <label className={`flex flex-col items-center justify-center w-full aspect-square rounded-[40px] border-2 border-dashed transition-all cursor-pointer ${productImage ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/10 hover:border-orange-500/30 bg-white/5 shadow-inner'
                                    }`}>
                                    {productImage ? (
                                        <img src={productImage} alt="Product" className="w-full h-full object-contain p-10" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-4 opacity-20">
                                            <ShoppingBag className="w-12 h-12" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Drop Item</span>
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
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" /> 2. Set Vibe
                                </label>
                                <div className="grid grid-cols-1 gap-2.5">
                                    {Object.values(AdVibe).map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setVibe(v)}
                                            className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${vibe === v
                                                ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl scale-[1.02]'
                                                : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                                                }`}
                                        >
                                            <span className="font-bold text-xs uppercase tracking-tight">{v}</span>
                                            {vibe === v && <CheckCircle2 className="w-4 h-4 text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleGenerateFullAd}
                            disabled={status.stage === 'generating'}
                            className="w-full bg-white text-black hover:bg-slate-200 disabled:bg-white/5 disabled:text-white/10 py-6 rounded-[40px] font-black text-2xl flex items-center justify-center gap-4 transition-all shadow-2xl uppercase tracking-tighter"
                        >
                            {status.stage === 'generating' ? <Loader2 className="w-8 h-8 animate-spin" /> : <Play className="w-8 h-8 fill-current" />}
                            {status.stage === 'generating' ? status.message : 'START CAMPAIGN'}
                        </button>

                        {/* Visual Storyboard */}
                        <div className="space-y-6 pt-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Clapperboard className="w-4 h-4" /> Storyboard Pipeline
                                </h3>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                {shots.length > 0 ? shots.map((shot) => (
                                    <div key={shot.id} className={`p-4 rounded-[32px] border transition-all duration-500 ${currentShotId === shot.id ? 'border-orange-500 bg-orange-600/10 shadow-[0_0_40px_rgba(255,77,0,0.1)]' : 'border-white/5 bg-white/5'
                                        }`}>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-orange-400">{shot.type}</span>
                                            {shot.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                            {shot.status === 'generating' && <Loader2 className="w-3 h-3 animate-spin text-orange-400" />}
                                            {shot.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                        </div>
                                        <div className="aspect-[9/16] bg-black/40 rounded-2xl overflow-hidden mb-3 relative flex items-center justify-center border border-white/5">
                                            {shot.videoUrl ? (
                                                <video src={shot.videoUrl} className="w-full h-full object-cover" controls={false} autoPlay loop muted />
                                            ) : shot.refImage ? (
                                                <img src={shot.refImage} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 opacity-10">
                                                    <Smartphone className="w-6 h-6" />
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[8px] text-slate-600 leading-snug line-clamp-2 font-medium">&quot;{shot.script}&quot;</p>
                                    </div>
                                )) : Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="aspect-[9/16] border border-white/5 rounded-[32px] flex items-center justify-center opacity-5 bg-white/5">
                                        <Smartphone className="w-8 h-8" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Master Viewfinder */}
                    <div className="flex flex-col items-center lg:sticky lg:top-8 h-fit">
                        <div className="w-full aspect-[9/16] bg-[#0c0c12] rounded-[64px] border-[16px] border-[#16161c] shadow-[0_0_150px_rgba(0,0,0,0.9)] overflow-hidden relative">

                            {/* Viewfinder HUD */}
                            <div className="absolute top-12 inset-x-8 flex justify-between z-40 pointer-events-none">
                                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                                    <span className="text-[10px] font-bold tracking-widest text-white uppercase italic">{masterVideoUrl ? 'FINAL CUT' : 'RECORDING'}</span>
                                </div>
                            </div>

                            {masterVideoUrl ? (
                                <div className="w-full h-full relative">
                                    <video
                                        src={masterVideoUrl}
                                        className="w-full h-full object-cover"
                                        autoPlay
                                        loop
                                        controls
                                    />
                                    <div className="absolute top-4 right-4 z-50">
                                        <span className="bg-emerald-600 text-[10px] font-black px-3 py-1 rounded-full text-white shadow-lg">FINAL AD READY</span>
                                    </div>
                                </div>
                            ) : shots.some(s => s.status === 'completed') ? (
                                <div className="w-full h-full relative">
                                    <video
                                        key={currentShotId ?? 'last'}
                                        src={shots.find(s => s.id === currentShotId)?.videoUrl || shots.filter(s => s.status === 'completed').pop()?.videoUrl}
                                        className="w-full h-full object-cover"
                                        autoPlay
                                        loop
                                        controls={false}
                                    />
                                    <div className="absolute inset-x-0 bottom-16 px-10 text-center pointer-events-none">
                                        <p className="text-white text-xs font-bold bg-black/50 backdrop-blur-sm py-3 px-4 rounded-2xl border border-white/10 shadow-2xl leading-tight">
                                            {shots.find(s => s.id === currentShotId)?.script || shots.filter(s => s.status === 'completed').pop()?.script}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-14 text-center">
                                    {status.stage === 'generating' ? (
                                        <div className="space-y-8">
                                            <div className="relative">
                                                <Loader2 className="w-20 h-20 animate-spin text-indigo-500/20 mx-auto" />
                                                <Smartphone className="absolute inset-0 m-auto w-8 h-8 text-indigo-500 animate-pulse" />
                                            </div>
                                            <div className="space-y-3">
                                                <span className="text-indigo-400 font-black tracking-tighter text-2xl italic uppercase animate-pulse">{status.message}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="opacity-10 group">
                                            <Smartphone className="w-24 h-24 mb-6 mx-auto group-hover:scale-110 transition-transform duration-500" />
                                            <span className="text-xs font-black uppercase tracking-[0.4em]">Empty Studio</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {status.stage === 'error' && (
                            <div className="mt-8 w-full p-6 bg-red-950/20 border border-red-500/20 rounded-[32px] flex items-start gap-4 text-red-400">
                                <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-bold text-xs uppercase tracking-widest mb-1">Production Error</h4>
                                    <p className="text-[10px] leading-relaxed opacity-70">{status.message}</p>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </main>

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
