import React from "react";

export default function ProcessingAnimation() {
    return (
        <div className="flex flex-col items-center justify-center space-y-6 py-8">
            {/* Synthwave Sun / Pulse */}
            <div className="relative h-24 w-24">
                <div className="absolute inset-0 animate-ping rounded-full bg-pink-500 opacity-20"></div>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-b from-pink-500 to-purple-600 shadow-[0_0_30px_#ff00ff]">
                    <span className="material-icons animate-pulse text-4xl text-white">graphic_eq</span>
                </div>
            </div>

            {/* Loading Text */}
            <div className="text-center">
                <h3 className="animate-pulse font-orbitron text-xl text-cyan-300 drop-shadow-[0_0_5px_#00e5ff]">
                    Transkriberer...
                </h3>
                <p className="mt-2 text-sm text-gray-300">
                    AI-modellen jobber med lydfilen din.
                </p>
            </div>

            {/* Progress Bar / Activity Indicator */}
            <div className="h-1 w-64 overflow-hidden rounded-full bg-gray-800">
                <div className="h-full w-full animate-progress-indeterminate bg-gradient-to-r from-cyan-400 via-pink-500 to-cyan-400"></div>
            </div>
        </div>
    );
}
