'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { PALETTE_COLORS } from '@/lib/constants';

export interface ColorState {
  hue: number;
  saturation: number;
  value: number;
}

interface ColorPaletteProps {
  onColorChange?: (color: ColorState) => void;
  syncedColor?: { hue: number; saturation: number; value: number; activeIndex: number } | null;
}

const DEBOUNCE_MS = 150;

export default function ColorPalette({ onColorChange, syncedColor }: ColorPaletteProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hue, setHue] = useState(280);
  const [saturation, setSaturation] = useState(85);
  const [value, setValue] = useState(50);
  const lastSyncRef = useRef(0);

  // Apply synced state from other browsers (skip if local change is recent)
  useEffect(() => {
    if (!syncedColor) return;
    const now = Date.now();
    // Don't override if user is actively dragging (within 2s of last local change)
    if (now - lastSyncRef.current < 2000) return;
    setHue(syncedColor.hue);
    setSaturation(syncedColor.saturation);
    setValue(syncedColor.value);
    setActiveIndex(syncedColor.activeIndex);
  }, [syncedColor]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onColorChangeRef = useRef(onColorChange);
  onColorChangeRef.current = onColorChange;

  // Debounced send — fires after slider stops moving
  const sendColor = useCallback((h: number, s: number, v: number) => {
    lastSyncRef.current = Date.now();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onColorChangeRef.current?.({ hue: h, saturation: s, value: v });
    }, DEBOUNCE_MS);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleHue = useCallback((h: number) => {
    setHue(h);
    sendColor(h, saturation, value);
  }, [saturation, value, sendColor]);

  const handleSaturation = useCallback((s: number) => {
    setSaturation(s);
    sendColor(hue, s, value);
  }, [hue, value, sendColor]);

  const handleValue = useCallback((v: number) => {
    setValue(v);
    sendColor(hue, saturation, v);
  }, [hue, saturation, sendColor]);

  const handlePreset = useCallback((i: number) => {
    setActiveIndex(i);
    const h = PALETTE_COLORS[i].hue;
    setHue(h);
    // Presets send immediately (no debounce needed)
    onColorChangeRef.current?.({ hue: h, saturation, value });
  }, [saturation, value]);

  return (
    <div className="palette-section">
      <div className="palette-label">Color Palette</div>
      <div className="palette">
        {PALETTE_COLORS.map((color, i) => (
          <button
            key={i}
            className={`palette-btn ${i === activeIndex ? 'active' : ''}`}
            style={{
              color: `hsl(${color.hue}, 85%, 55%)`,
              ['--btn-index' as string]: i,
              animationDelay: `${i * 0.1}s`,
            } as React.CSSProperties}
            title={color.name}
            onClick={() => handlePreset(i)}
          />
        ))}
      </div>
      <div className="hsv-sliders">
        <div className="sl">
          <label>Chroma <span style={{ color: `hsl(${hue}, 85%, 65%)` }}>{hue}&deg;</span></label>
          <input
            type="range"
            min="0"
            max="360"
            value={hue}
            onChange={(e) => handleHue(parseInt(e.target.value))}
            style={{
              background: 'linear-gradient(to right, hsl(0,85%,55%), hsl(60,85%,55%), hsl(120,85%,55%), hsl(180,85%,55%), hsl(240,85%,55%), hsl(300,85%,55%), hsl(360,85%,55%))',
              height: '6px',
            }}
          />
        </div>
        <div className="sl">
          <label>Saturation <span>{saturation}%</span></label>
          <input type="range" min="0" max="100" value={saturation} onChange={(e) => handleSaturation(parseInt(e.target.value))} />
        </div>
        <div className="sl">
          <label>Value <span>{value}%</span></label>
          <input type="range" min="0" max="100" value={value} onChange={(e) => handleValue(parseInt(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
