import React from 'react';

export const GlobalFooter: React.FC = () => {
    return (
        <footer className="w-full text-center py-4 bg-white/50 backdrop-blur-sm border-t border-gray-100 mt-auto shrink-0 select-none transition-all">
            <div className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-4 text-[11px] md:text-xs text-gray-400 font-medium">
                <span className="opacity-80">© 2026 Ban Hạ tầng Kỹ thuật. All rights reserved.</span>

            </div>
        </footer>
    );
};
