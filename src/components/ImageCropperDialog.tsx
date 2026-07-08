import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, ZoomIn, ZoomOut, Move } from 'lucide-react';

interface ImageCropperDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  aspectRatio?: number; // width / height (default 1)
  onCropComplete: (croppedBlob: Blob) => void;
}

export default function ImageCropperDialog({
  isOpen,
  onClose,
  imageSrc,
  aspectRatio = 1,
  onCropComplete
}: ImageCropperDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset state when a new image is loaded
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setImgLoaded(false);
    }
  }, [isOpen, imageSrc]);

  if (!isOpen) return null;

  // Calculate the crop box dimensions relative to the container
  const cropBoxWidth = 280;
  const cropBoxHeight = cropBoxWidth / aspectRatio;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch event handlers for mobile support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0]!;
    setIsDragging(true);
    dragStart.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0]!;
    setPan({
      x: touch.clientX - dragStart.current.x,
      y: touch.clientY - dragStart.current.y
    });
  };

  const handleApply = () => {
    const img = imageRef.current;
    if (!img) return;

    const canvas = document.createElement('canvas');
    
    // Set high-res output
    const scaleFactor = 2; 
    const outputWidth = cropBoxWidth * scaleFactor;
    const outputHeight = cropBoxHeight * scaleFactor;
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Source image dimensions as rendered in DOM
    const renderedWidth = img.clientWidth;
    const renderedHeight = img.clientHeight;

    // Draw image applying the exact same transform seen in the crop box
    ctx.translate((cropBoxWidth / 2 + pan.x) * scaleFactor, (cropBoxHeight / 2 + pan.y) * scaleFactor);
    ctx.scale(zoom * scaleFactor, zoom * scaleFactor);
    ctx.translate(-renderedWidth / 2, -renderedHeight / 2);
    ctx.drawImage(img, 0, 0, renderedWidth, renderedHeight);

    canvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
        onClose();
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative bg-background border rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-bold text-sm">Adjust Image</h3>
            <p className="text-[10px] text-muted-foreground">Pan and zoom to crop your image</p>
          </div>
          <button 
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cropper viewport */}
        <div className="flex-1 bg-zinc-950 flex items-center justify-center p-6 min-h-[320px]">
          <div 
            ref={containerRef}
            className="relative border border-white/20 shadow-inner overflow-hidden select-none bg-zinc-900 flex items-center justify-center"
            style={{
              width: `${cropBoxWidth}px`,
              height: `${cropBoxHeight}px`,
              borderRadius: aspectRatio === 1 ? '16px' : '8px'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
          >
            {/* Guide grid lines */}
            <div className="absolute inset-0 border border-dashed border-white/20 pointer-events-none z-10 grid grid-cols-3 grid-rows-3">
              <div className="border-r border-b border-white/10"></div>
              <div className="border-r border-b border-white/10"></div>
              <div className="border-b border-white/10"></div>
              <div className="border-r border-b border-white/10"></div>
              <div className="border-r border-b border-white/10"></div>
              <div className="border-b border-white/10"></div>
              <div className="border-r border-white/10"></div>
              <div className="border-r border-white/10"></div>
              <div></div>
            </div>

            {/* Panning indicator */}
            <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white/70 pointer-events-none z-15">
              <Move className="h-3.5 w-3.5" />
            </div>

            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop Source"
              className="max-w-none pointer-events-none object-contain transition-opacity duration-200"
              style={{
                opacity: imgLoaded ? 1 : 0,
                width: aspectRatio >= 1 ? '100%' : 'auto',
                height: aspectRatio < 1 ? '100%' : 'auto',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center'
              }}
              onLoad={() => setImgLoaded(true)}
            />
          </div>
        </div>

        {/* Zoom controls */}
        <div className="p-4 bg-background border-t space-y-3">
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold w-10 text-right">{Math.round(zoom * 100)}%</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply}>
              Save & Apply
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
