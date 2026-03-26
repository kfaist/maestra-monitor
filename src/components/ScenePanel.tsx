'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

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
    state: { scene: 'idle', 'visual.speed': 0.2, 'visual.noise': 0.3, 'lighting.intensity': 0.2, 'audio.energy': 0.1 },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    color: 'rgba(0,212,255,0.5)',
    state: { scene: 'pulse', 'visual.speed': 0.9, 'visual.scale': 1.1, 'lighting.intensity': 0.7, 'lighting.pulse': true },
  },
  {
    id: 'bloom',
    label: 'Bloom',
    color: 'rgba(255,160,60,0.5)',
    state: { scene: 'bloom', 'visual.palette': 'warm', 'visual.diffusion': 0.8, 'lighting.intensity': 0.6, 'audio.reverb': 0.9 },
  },
  {
    id: 'surge',
    label: 'Surge',
    color: 'rgba(255,60,90,0.5)',
    state: { scene: 'surge', 'visual.speed': 1.4, 'visual.glitch': 0.3, 'lighting.intensity': 1.0, 'audio.energy': 1.0 },
  },
  {
    id: 'dissolve',
    label: 'Dissolve',
    color: 'rgba(160,100,255,0.5)',
    state: { scene: 'dissolve', 'visual.speed': 0.3, 'visual.blur': 0.7, 'lighting.intensity': 0.3, 'audio.reverb': 0.8 },
  },
];

const AUTO_INJECT_INTERVAL = 5000;
const P6_FLUSH_DELAY = 5000;

const STOP_WORDS = new Set([
  'i','me','my','we','you','he','she','it','they','this','that','a','an','the',
  'is','was','are','were','be','been','have','has','had','do','did','will','would',
  'could','should','may','might','can','to','of','in','on','at','by','for','with',
  'about','as','into','from','and','or','but','if','so','then','when','where',
  'what','which','who','how','not','no','very','just','also','up','out','get',
  'got','go','went','come','came','see','say','said','know','think','make',
  'take','use','find','give','tell','like','really','yeah','okay','right',
  'well','thing','things','some','there','here','all','more','much','than',
]);

function extractNouns(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const extracted = new Set<string>();
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length >= 3 && !STOP_WORDS.has(clean)) extracted.add(clean);
  }
  return Array.from(extracted).slice(0, 12);
}

interface ScenePanelProps {
  onActivateScene: (scene: SceneDefinition) => void;
}

export default function ScenePanel({
  onActivateScene,
  injectActive,
  onInjectToggle,
  promptText,
  onPromptChange,
  onBroadcast,
  onP6Flush,
}: ScenePanelProps) {
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [transEnabled, setTransEnabled] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [nouns, setNouns] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [autoInjectCountdown, setAutoInjectCountdown] = useState(5);
  const [lastBroadcast, setLastBroadcast] = useState<number | null>(null);
  const [p6Flushing, setP6Flushing] = useState(false);
  const [publishOnActivate, setPublishOnActivate] = useState(true);
  const [receiveUpdates, setReceiveUpdates] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const autoInjectRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const p6TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptTextRef = useRef(promptText);
  promptTextRef.current = promptText;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const onBroadcastRef = useRef(onBroadcast);
  onBroadcastRef.current = onBroadcast;
  const onP6FlushRef = useRef(onP6Flush);
  onP6FlushRef.current = onP6Flush;

  const getCombinedPrompt = useCallback(() => {
    const base = promptTextRef.current.trim();
    const trans = transcriptRef.current.trim();
    if (base && trans) return `${base} | ${trans}`;
    return trans || base;
  }, []);

  // Scene handler
  const handleSceneClick = useCallback((scene: SceneDefinition) => {
    setActiveScene(scene.id);
    onActivateScene(scene);
  }, [onActivateScene]);

  // Speech Recognition
  useEffect(() => {
    if (!transEnabled) {
      if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
      setIsListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setTranscript('Speech recognition not supported.'); return; }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => { setIsListening(false); if (transEnabled) { try { recognition.start(); } catch { /* */ } } };
    recognition.onerror = () => setIsListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalText = '', interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript + ' '; else interimText += r[0].transcript;
      }
      const fullText = (finalText + interimText).trim();
      setTranscript(fullText);
      setNouns(extractNouns(fullText));
    };
    try { recognition.start(); recognitionRef.current = recognition; } catch { /* */ }
    return () => { try { recognition.stop(); } catch { /* */ } recognitionRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transEnabled]);

  // Auto-inject timer
  useEffect(() => {
    if (injectActive) {
      setAutoInjectCountdown(5);
      countdownRef.current = setInterval(() => { setAutoInjectCountdown(prev => prev <= 1 ? 5 : prev - 1); }, 1000);
      autoInjectRef.current = setInterval(() => {
        const combined = getCombinedPrompt();
        if (combined) { setLastBroadcast(Date.now()); onBroadcastRef.current(combined); }
      }, AUTO_INJECT_INTERVAL);
      const combined = getCombinedPrompt();
      if (combined) { onBroadcastRef.current(combined); setLastBroadcast(Date.now()); }
      return () => { if (autoInjectRef.current) clearInterval(autoInjectRef.current); if (countdownRef.current) clearInterval(countdownRef.current); };
    } else {
      if (autoInjectRef.current) clearInterval(autoInjectRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setAutoInjectCountdown(5);
    }
  }, [injectActive, getCombinedPrompt]);

  // P6 flush timer
  useEffect(() => {
    if (lastBroadcast && injectActive) {
      setP6Flushing(false);
      if (p6TimerRef.current) clearTimeout(p6TimerRef.current);
      p6TimerRef.current = setTimeout(() => {
        const combined = getCombinedPrompt();
        setP6Flushing(true);
        onP6FlushRef.current(combined);
        setTimeout(() => setP6Flushing(false), 1500);
      }, P6_FLUSH_DELAY);
      return () => { if (p6TimerRef.current) clearTimeout(p6TimerRef.current); };
    }
  }, [lastBroadcast, injectActive, getCombinedPrompt]);

  const combinedPreview = (() => {
    const base = promptText.trim();
    const trans = transcript.trim();
    if (base && trans) return `${base} | ${trans}`;
    return trans || base;
  })();

  return (
    <div className="scene-bar">
      {/* ── Scenes row + controls ── */}
      <div className="scene-bar-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="scene-bar-label">// Scenes</div>

        <div className="scene-grid" style={{ flex: 1 }}>
          {SCENES.map(scene => (
            <button
              key={scene.id}
              className={`scene-btn ${activeScene === scene.id ? 'scene-active' : ''}`}
              style={{ '--scene-color': scene.color } as React.CSSProperties}
              onClick={() => handleSceneClick(scene)}
            >
              <span className="scene-btn-label">{scene.label}</span>
            </button>
          ))}
        </div>

        {/* ▶ / ⏸ trigger */}
        <button
          onClick={() => {
            if (activeScene) {
              const scene = SCENES.find(s => s.id === activeScene);
              if (scene) handleSceneClick(scene);
            } else {
              handleSceneClick(SCENES[0]);
            }
          }}
          title={activeScene ? 'Re-trigger active scene' : 'Trigger first scene'}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            color: activeScene ? 'var(--active)' : 'var(--text-dim)',
            borderRadius: 2, padding: '3px 9px', cursor: 'pointer',
            fontSize: 13, lineHeight: 1, transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          {activeScene ? '⏵' : '▶'}
        </button>

        {/* IN / OUT event checkboxes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={publishOnActivate}
              onChange={e => setPublishOnActivate(e.target.checked)}
              style={{ accentColor: 'var(--active)', width: 11, height: 11, cursor: 'pointer' }}
            />
            ↑ OUT
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={receiveUpdates}
              onChange={e => setReceiveUpdates(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 11, height: 11, cursor: 'pointer' }}
            />
            ↓ IN
          </label>
        </div>
      </div>
    </div>
  );
}
