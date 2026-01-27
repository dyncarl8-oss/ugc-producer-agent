"use client";
import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { RefreshCcw, X } from "lucide-react";

interface CheckoutModalProps {
    sessionId: string;
    onClose: () => void;
    onComplete: (paymentId: string) => void;
}

export function CheckoutModal({ sessionId, onClose, onComplete }: CheckoutModalProps) {
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-600/10 blur-[150px] rounded-full" />
            </div>

            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-8 right-8 z-[210] w-12 h-12 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center border border-white/10 transition-all group"
            >
                <X className="w-5 h-5 text-white group-hover:rotate-90 transition-transform" />
            </button>

            {/* Modal container */}
            <div className="relative z-10 w-full max-w-md bg-[#0c0c12]/80 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl shadow-black/50">
                {/* Header */}
                <div className="p-6 border-b border-white/5 text-center">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Complete Purchase</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Secure Checkout</p>
                </div>

                {/* Checkout embed container */}
                <div className="p-4 min-h-[400px]">
                    <WhopCheckoutEmbed
                        sessionId={sessionId}
                        returnUrl={typeof window !== 'undefined' ? window.location.href : ''}
                        onComplete={(paymentId: string) => {
                            onComplete(paymentId);
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
