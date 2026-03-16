'use client';

import { useState } from 'react';
import { PALETTE_COLORS } from '@/lib/constants';

export default function ColorPalette() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hue, setHue] = useState(280);
  const [saturation, setSaturation] = useState(85);
  const [value, setValue] = useState(50);

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
            onClick={() => {
              setActiveIndex(i);
              setHue(color.hue);
            }}
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
            onChange={(e) => setHue(parseInt(e.target.value))}
            style={{
              background: 'linear-gradient(to right, hsl(0,85%,55%), hsl(60,85%,55%), hsl(120,85%,55%), hsl(180,85%,55%), hsl(240,85%,55%), hsl(300,85%,55%), hsl(360,85%,55%))',
              height: '6px',
            }}
          />
        </div>
        <div className="sl">
          <label>Saturation <span>{saturation}%</span></label>
          <input type="range" min="0" max="100" value={saturation} onChange={(e) => setSaturation(parseInt(e.target.value))} />
        </div>
        <div className="sl">
          <label>Value <span>{value}%</span></label>
          <input type="range" min="0" max="100" value={value} onChange={(e) => setValue(parseInt(e.target.value))} />
        </div>
      </div>
    </div>
  );
}
