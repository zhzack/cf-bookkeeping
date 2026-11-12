import React, { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { AttachmentPhoto } from '../types';
import { PhotoLightbox } from './PhotoLightbox';
import { compressImageToDataUrl } from '../utils/image';

interface Props {
  label?: string;
  existingPhotos: AttachmentPhoto[];
  onRemoveExisting: (id: string) => void;
  newPhotos: string[];
  onAddNewPhotos: (urls: string[]) => void;
  onRemoveNewPhoto: (index: number) => void;
  photosLoading?: boolean;
  onError?: (msg: string) => void;
  onCompressingChange?: (busy: boolean) => void;
  maxPhotos?: number;
}

export const PhotoPicker: React.FC<Props> = ({
  label = '照片附件',
  existingPhotos,
  onRemoveExisting,
  newPhotos,
  onAddNewPhotos,
  onRemoveNewPhoto,
  photosLoading = false,
  onError,
  onCompressingChange,
  maxPhotos = 3,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const totalCount = existingPhotos.length + newPhotos.length;

  return (
    <>
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              {label} ({totalCount}/{maxPhotos})
            </span>
          </span>
          {compressing && <span className="text-[11px] text-indigo-600 font-medium">正在压缩图片...</span>}
          {photosLoading && <span className="text-[11px] text-slate-400">加载已有照片中...</span>}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {existingPhotos.map((photo, idx) => (
            <div
              key={photo.id}
              className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-white"
            >
              <img
                src={photo.data_url}
                alt="已有照片"
                onClick={() => setLightboxIndex(idx)}
                className="w-full h-full object-cover cursor-pointer"
              />
              <button
                type="button"
                onClick={() => onRemoveExisting(photo.id)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition"
                title="移除照片"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {newPhotos.map((dataUrl, idx) => (
            <div
              key={`new_${idx}`}
              className="relative w-16 h-16 rounded-xl overflow-hidden border border-indigo-200 bg-white"
            >
              <img
                src={dataUrl}
                alt="新上传照片"
                onClick={() => setLightboxIndex(existingPhotos.length + idx)}
                className="w-full h-full object-cover cursor-pointer"
              />
              <button
                type="button"
                onClick={() => onRemoveNewPhoto(idx)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-rose-600 text-white flex items-center justify-center transition"
                title="移除照片"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {totalCount < maxPhotos && (
            <button
              type="button"
              disabled={compressing}
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-400 hover:text-indigo-600 flex flex-col items-center justify-center gap-1 transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span className="text-[10px] font-medium">添加照片</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length === 0) return;

              const remainingSlots = maxPhotos - totalCount;
              const selected = files.slice(0, remainingSlots);
              if (files.length > remainingSlots) {
                onError?.(`最多只能保存 ${maxPhotos} 张照片，已自动截取前 ${remainingSlots} 张`);
              } else {
                onError?.('');
              }

              setCompressing(true);
              onCompressingChange?.(true);
              try {
                const compressed = await Promise.all(selected.map((f) => compressImageToDataUrl(f)));
                onAddNewPhotos(compressed);
              } catch (err: any) {
                onError?.(err.message || '图片处理失败');
              } finally {
                setCompressing(false);
                onCompressingChange?.(false);
              }
            }}
          />
        </div>
      </div>

      {lightboxIndex !== null && (
        <PhotoLightbox
          images={[...existingPhotos.map((p) => p.data_url), ...newPhotos]}
          activeIndex={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
};
