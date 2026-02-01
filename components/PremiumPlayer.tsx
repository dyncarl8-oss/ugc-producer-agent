'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, Maximize } from 'lucide-react';

interface PremiumPlayerProps {
    src: string;
    autoPlay?: boolean;
    loop?: boolean;
    className?: string;
}

export const PremiumPlayer: React.FC<PremiumPlayerProps> = ({
    src,
    autoPlay = true,
    loop = true,
    className = ""
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateTime = () => setCurrentTime(video.currentTime);
        const updateDuration = () => setDuration(video.duration);
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', updateTime);
        video.addEventListener('loadedmetadata', updateDuration);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', updateTime);
            video.removeEventListener('loadedmetadata', updateDuration);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, [src]);

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
        } else {
            videoRef.current.pause();
        }
    };

    const toggleMute = () => {
        if (!videoRef.current) return;
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const time = parseFloat(e.target.value);
        videoRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleInteraction = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false);
            }
        }, 3000);
    };

    return (
        <div
            className={`relative group h-full w-full overflow-hidden bg-black ${className}`}
            onMouseMove={handleInteraction}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onClick={togglePlay}
        >
            <video
                ref={videoRef}
                src={src}
                className="w-full h-full object-cover"
                autoPlay={autoPlay}
                loop={loop}
                muted={isMuted}
                playsInline
            />

            {/* Big Play Button Overlay */}
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] transition-all">
                    <div className="w-20 h-20 bg-orange-600 rounded-full flex items-center justify-center shadow-2xl shadow-orange-600/40 animate-in zoom-in-75 duration-300">
                        <Play className="w-10 h-10 text-white fill-white ml-1" />
                    </div>
                </div>
            )}

            {/* Premium Controls */}
            <div
                className={`absolute inset-x-0 bottom-0 p-6 pt-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-all duration-500 flex flex-col gap-4 ${showControls || !isPlaying ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                    }`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Progress Bar */}
                <div className="group/progress relative flex items-center h-2 cursor-pointer">
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        step="0.01"
                        value={currentTime}
                        onChange={handleSeek}
                        className="absolute inset-0 w-full h-1.5 appearance-none bg-white/20 rounded-full cursor-pointer overflow-hidden accent-orange-600"
                        style={{
                            background: `linear-gradient(to right, #ea580c ${(currentTime / duration) * 100 || 0}%, rgba(255,255,255,0.2) ${(currentTime / duration) * 100 || 0}%)`
                        }}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={togglePlay}
                            className="text-white hover:text-orange-500 transition-colors"
                        >
                            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                        </button>

                        <button
                            onClick={toggleMute}
                            className="text-white hover:text-orange-500 transition-colors"
                        >
                            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>

                        <div className="text-[10px] font-black text-white/80 tracking-widest uppercase italic">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => {
                                if (videoRef.current) videoRef.current.currentTime = 0;
                            }}
                            className="text-white hover:text-orange-500 transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom Orange Glow Effect Filter */}
            <div className="absolute inset-0 pointer-events-none border-[1px] border-orange-500/10 rounded-inherit mix-blend-overlay" />

            <style jsx>{`
                input[type='range']::-webkit-slider-thumb {
                    appearance: none;
                    width: 12px;
                    height: 12px;
                    background: white;
                    border-radius: 50%;
                    border: 2px solid #ea580c;
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(234, 88, 12, 0.5);
                    transition: transform 0.2s;
                }
                input[type='range']:hover::-webkit-slider-thumb {
                    transform: scale(1.2);
                }
                input[type='range']::-moz-range-thumb {
                    width: 12px;
                    height: 12px;
                    background: white;
                    border-radius: 50%;
                    border: 2px solid #ea580c;
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(234, 88, 12, 0.5);
                }
            `}</style>
        </div>
    );
};
