'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface SignalPanelProps {
  injectActive: boolean;
  onInjectToggle: (active: boolean) => void;
  promptText: string;
  onPromptChange: (text: string) => void;
  onBroadcast: (prompt: string) => void;
  onP6Flush: (prompt: string) => void;
}

const AUTO_INJECT_INTERVAL = 5000;
const P6_FLUSH_DELAY = 5000;

// Common stop words to filter out — keep meaningful content words
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

// Extract meaningful words from speech text (works with lowercase speech recognition output)
function extractNouns(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const extracted = new Set<string>();
  for (const w of words) {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length >= 3 && !STOP_WORDS.has(clean)) {
      extracted.add(clean);
    }
  }
  return Array.from(extracted).slice(0, 12);
}

export default function SignalPanel({
  injectActive,
  onInjectToggle,
  promptText,
  onPromptChange,
  onBroadcast,
  onP6Flush,
}: SignalPanelProps) {
  const [transEnabled, setTransEnabled] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [nouns, setNouns] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [autoInjectCountdown, setAutoInjectCountdown] = useState(5);
  const [lastBroadcast, setLastBroadcast] = useState<number | null>(null);
  const [p6Flushing, setP6Flushing] = useState(false);

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
  const onPromptChangeRef = useRef(onPromptChange);
  onPromptChangeRef.current = onPromptChange;

  // Build the combined prompt: base prompt + transcript
  const getCombinedPrompt = useCallback(() => {
    const base = promptTextRef.current.trim();
    const trans = transcriptRef.current.trim();
    if (base && trans) return `${base} | ${trans}`;
    return trans || base;
  }, []);

  // Speech Recognition
  useEffect(() => {
    if (!transEnabled) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setTranscript('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      if (transEnabled) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript + ' ';
        } else {
          interimText += result[0].transcript;
        }
      }
      const fullText = (finalText + interimText).trim();
      setTranscript(fullText);
      setNouns(extractNouns(fullText));
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch { /* */ }

    return () => {
      try { recognition.stop(); } catch { /* */ }
      recognitionRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transEnabled]);

  // Auto-inject timer — broadcasts combined prompt (base + transcript)
  useEffect(() => {
    if (injectActive) {
      setAutoInjectCountdown(5);

      countdownRef.current = setInterval(() => {
        setAutoInjectCountdown(prev => prev <= 1 ? 5 : prev - 1);
      }, 1000);

      autoInjectRef.current = setInterval(() => {
        const combined = getCombinedPrompt();
        if (combined) {
          setLastBroadcast(Date.now());
          onBroadcastRef.current(combined);
        }
      }, AUTO_INJECT_INTERVAL);

      // Immediate first broadcast
      const combined = getCombinedPrompt();
      if (combined) {
        onBroadcastRef.current(combined);
        setLastBroadcast(Date.now());
      }

      return () => {
        if (autoInjectRef.current) clearInterval(autoInjectRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    } else {
      if (autoInjectRef.current) clearInterval(autoInjectRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setAutoInjectCountdown(5);
    }
  }, [injectActive, getCombinedPrompt]);

  // P6 flush — fires P6_FLUSH_DELAY ms after each broadcast
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

  // Show what will actually be sent
  const combinedPreview = (() => {
    const base = promptText.trim();
    const trans = transcript.trim();
    if (base && trans) return `${base} | ${trans}`;
    return trans || base;
  })();

  return (
    <div className="signal-panel">
      <div className="signal-section">
        {/* Transcription header */}
        <div className="sp-header">
          <div className="sp-title-row">
            <span className="sp-title">Transcription</span>
            {isListening && (
              <span className="sp-listening-badge">
                <span className="sp-listening-dot" />
                Listening
              </span>
            )}
          </div>
        </div>

        {/* Transcript display with inline toggle */}
        <div className="sp-transcript" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setTransEnabled(!transEnabled)}
            className="maestra-action-btn"
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              letterSpacing: '0.05em',
              border: `1px solid ${transEnabled ? '#22c55e' : '#333'}`,
              borderRadius: 5,
              background: transEnabled ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: transEnabled ? '#22c55e' : '#888',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {transEnabled ? '● ON' : '○ OFF'}
          </button>
          <div style={{ flex: 1 }}>
            {transcript ? (
              <span>{transcript}</span>
            ) : (
              <span style={{ color: '#e0e0e8' }}>
                {transEnabled ? 'Speak into your microphone...' : <>Enable <span style={{ color: '#5cc8ff' }}>transcription</span> to capture speech</>}
              </span>
            )}
            {transEnabled && <span className="cursor" />}
          </div>
        </div>

        {/* Nouns */}
        <div className="sp-section-label">
          <span>Extracted Nouns</span>
          <span className="sp-count">{nouns.length}</span>
        </div>
        <div className="noun-tags">
          {nouns.length > 0 ? nouns.map((n, i) => (
            <span key={i} className="noun-tag fresh">{n}</span>
          )) : (
            <span className="sp-empty">No nouns extracted yet</span>
          )}
        </div>

        {/* Prompt input */}
        <div className="sp-section-label" style={{ marginTop: '12px' }}>
          <span>Base Prompt</span>
          {injectActive && <span className="sp-live-indicator">LIVE</span>}
        </div>
        <div className="sp-prompt-row">
          <textarea
            className="sp-prompt-input"
            placeholder="baroque cathedral, golden light, deep shadows..."
            value={promptText}
            onChange={(e) => onPromptChange(e.target.value)}
          />
          <button
            className={`sp-inject-btn ${injectActive ? 'live' : ''}`}
            onClick={() => onInjectToggle(!injectActive)}
          >
            {injectActive ? 'Stop' : 'Inject'}
          </button>
        </div>

        {/* Combined prompt preview — shows what actually gets sent */}
        {(injectActive || transcript) && combinedPreview && (
          <div className="sp-combined-preview">
            <span className="sp-combined-label">Sending to TD</span>
            <span className="sp-combined-text">{combinedPreview}</span>
          </div>
        )}

        {/* Auto-inject status bar */}
        {injectActive && (
          <div className="sp-auto-bar">
            <span className="sp-auto-label">Auto-Inject</span>
            <div className="sp-auto-progress">
              <div
                className="sp-auto-fill"
                style={{ width: `${((5 - autoInjectCountdown) / 5) * 100}%` }}
              />
            </div>
            <span className="sp-auto-countdown">{autoInjectCountdown}s</span>
            {p6Flushing && (
              <span className="sp-p6-badge">P6 FLUSH</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
