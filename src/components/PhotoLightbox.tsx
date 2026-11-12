import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  images: string[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
  loading?: boolean;
}

export const PhotoLightbox: React.FC<Props> = ({
  images,
  activeIndex,
  onChangeIndex,
  onClose,
  loading = false,
}) => {
  if (!loading && images.length === 0) return null;

  const safeIdx = Math.min(Math.max(0, activeIndex), Math.max(0, images.length - 1));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition"
      >
        <X className="w-5 h-5" />
      </button>

      {loading ? (
        <div className="text-white text-xs">加载照片中...</div>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-2xl w-full flex flex-col items-center gap-3"
        >
          <img
            src={images[safeIdx]}
            alt={`账单照片 ${safeIdx + 1}`}
            className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
          />

          {images.length > 1 && (
            <div className="flex items-center gap-4 text-white text-xs">
              <button
                type="button"
                onClick={() => onChangeIndex((safeIdx - 1 + images.length) % images.length)}
                className="p-2 rounded-full bg-white/15 hover:bg-white/25 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono">
                {safeIdx + 1} / {images.length}
              </span>
              <button
                type="button"
                onClick={() => onChangeIndex((safeIdx + 1) % images.length)}
                className="p-2 rounded-full bg-white/15 hover:bg-white/25 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
