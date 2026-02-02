import React, { useRef, useEffect, useState } from 'react';
import { Play } from 'lucide-react';

interface CustomVideoPlayerProps {
    src: string;
    className?: string;
    autoPlay?: boolean;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({ src, className, autoPlay = true }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [progress, setProgress] = useState(0);
    const [isPlaying, setIsPlaying] = useState(autoPlay);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateProgress = () => {
            if (video.duration) {
                setProgress((video.currentTime / video.duration) * 100);
            }
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', updateProgress);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', updateProgress);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, []);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const video = videoRef.current;
        if (!video) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration;
    };

    return (
        <div className={`w-full h-full relative group/player ${className || ''}`}>
            <video
                ref={videoRef}
                src={src}
                className="w-full h-full object-cover"
                autoPlay={autoPlay}
                loop
                playsInline
                onClick={togglePlay}
            />

            {/* Custom Player Controls */}
            <div className={`absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 pointer-events-none ${isPlaying ? 'opacity-0 group-hover/player:opacity-100' : 'opacity-100'}`}>
                <div className="flex flex-col gap-3 pointer-events-auto">
                    <div
                        className="w-full h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer relative group/progress"
                        onClick={handleSeek}
                    >
                        <div
                            className="absolute inset-y-0 left-0 bg-orange-600 rounded-full transition-all duration-100"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <button
                            className="text-white hover:text-orange-400 transition-colors"
                            onClick={togglePlay}
                        >
                            <Play className={`w-4 h-4 fill-current ${isPlaying ? 'opacity-100' : 'opacity-100'}`} />
                        </button>
                        <span className="text-[10px] font-bold text-white/50 tracking-widest">VEOS VIDEO PLAYER</span>
                    </div>
                </div>
            </div>

            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 bg-black/30 backdrop-blur-sm rounded-full flex items-center justify-center pointer-events-auto cursor-pointer hover:scale-110 transition-transform" onClick={togglePlay}>
                        <Play className="w-6 h-6 text-white fill-white ml-1" />
                    </div>
                </div>
            )}
        </div>
    );
};
