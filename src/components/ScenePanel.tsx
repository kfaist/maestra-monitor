'use client';

import { useState, useCallback } from 'react';

export interface SceneDefinition {
  id: string;
  label: string;
  color: string;
  state: Record<string, string | number | boolean>;
}

const SCENES: SceneDefinition[] = [
  {
    id: 'idle',
    label: 'Idle',
    color: 'rgba(100,120,180,0.5)',
    state: {
      scene: 'idle',
      'visual.speed': 0.2,
      'visual.noise': 0.3,
      'lighting.intensity': 0.2,
      'audio.energy': 0.1,
    },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    color: 'rgba(0,212,255,0.5)',
    state: {
      scene: 'pulse',
      'visual.speed': 0.9,
      'visual.scale': 1.1,
      'lighting.intensity': 0.7,
      'lighting.pulse': true,
    },
  },
  {
    id: 'bloom',
    label: 'Bloom',
    color: 'rgba(255,160,60,0.5)',
    state: {
      scene: 'bloom',
      'visual.palette': 'warm',
      'visual.diffusion': 0.8,
      'lighting.intensity': 0.6,
      'audio.reverb': 0.9,
    },
  },
  {
    id: 'surge',
    label: 'Surge',
    color: 'rgba(255,60,90,0.5)',
    state: {
      scene: 'surge',
      'visual.speed': 1.4,
      'visual.glitch': 0.3,
      'lighting.intensity': 1.0,
      'audio.energy': 1.0,
    },
  },
  {
    id: 'dissolve',
    label: 'Dissolve',
    color: 'rgba(160,100,255,0.5)',
    state: {
      scene: 'dissolve',
      'visual.speed': 0.3,
      'visual.blur': 0.7,
      'lighting.intensity': 0.3,
      'audio.reverb': 0.8,
    },
  },
];

interface ScenePanelProps {
  onActivateScene: (scene: SceneDefinition) => void;
}

export default function ScenePanel({ onActivateScene }: ScenePanelProps) {
  const [activeScene, setActiveScene] = useState<string | null>(null);

  const handleClick = useCallback((scene: SceneDefinition) => {
    setActiveScene(scene.id);
    onActivateScene(scene);
  }, [onActivateScene]);

  return (
    <div className="scene-panel">
      <div className="scene-panel-head">// Scenes</div>
      <div className="scene-grid">
        {SCENES.map(scene => (
          <button
            key={scene.id}
            className={`scene-btn ${activeScene === scene.id ? 'scene-active' : ''}`}
            style={{ '--scene-color': scene.color } as React.CSSProperties}
            onClick={() => handleClick(scene)}
          >
            <span className="scene-btn-label">{scene.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
