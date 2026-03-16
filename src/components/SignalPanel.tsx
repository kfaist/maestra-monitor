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

// Extract nouns (capitalized words, 3+ chars, not at sentence start)
function extractNouns(text: string): string[] {
  const words = text.split(/\s+/);
  const nouns = new Set<string>();
  words.forEach((w, i) => {
    const clean = w.replace(/[^a-zA-Z]/g, '');
    if (clean.length >= 3 && /^[A-Z]/.test(clean) && i > 0) {
      nouns.add(clean.toLowerCase());
    }
  });
  // Also grab any word after common articles/prepositions as likely nouns
  const pattern = /\b(?:the|a|an|this|that|my|your|our|some|each|every)\s+(\w{3,})/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    nouns.add(match[1].toLowerCase());
  }
  return Array.from(nouns).slice(0, 12);
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
  const onBroadcastRef = useRef(onBroadcast);
  onBroadcastRef.current = onBroadcast;
  const onP6FlushRef = useRef(onP6Flush);
  onP6FlushRef.current = onP6Flush;

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
      // Auto-restart if still enabled
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

  // Auto-inject timer
  useEffect(() => {
    if (injectActive) {
      setAutoInjectCountdown(5);

      countdownRef.current = setInterval(() => {
        setAutoInjectCountdown(prev => prev <= 1 ? 5 : prev - 1);
      }, 1000);

      autoInjectRef.current = setInterval(() => {
        const currentPrompt = promptTextRef.current;
        if (currentPrompt.trim()) {
          setLastBroadcast(Date.now());
          onBroadcastRef.current(currentPrompt);
        }
      }, AUTO_INJECT_INTERVAL);

      if (promptTextRef.current.trim()) {
        onBroadcastRef.current(promptTextRef.current);
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
  }, [injectActive]);

  // P6 flush
  useEffect(() => {
    if (lastBroadcast && injectActive) {
      setP6Flushing(false);
      if (p6TimerRef.current) clearTimeout(p6TimerRef.current);
      p6TimerRef.current = setTimeout(() => {
        setP6Flushing(true);
        onP6FlushRef.current(promptTextRef.current);
        setTimeout(() => setP6Flushing(false), 1500);
      }, P6_FLUSH_DELAY);
      return () => { if (p6TimerRef.current) clearTimeout(p6TimerRef.current); };
    }
  }, [lastBroadcast, injectActive]);

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
          <label className="toggle" title="Enable speech-to-text">
            <input
              type="checkbox"
              checked={transEnabled}
              onChange={(e) => setTransEnabled(e.target.checked)}
            />
            <div className="toggle-track">
              <div className="toggle-thumb" />
            </div>
            <span className="toggle-label">{transEnabled ? 'On' : 'Off'}</span>
          </label>
        </div>

        {/* Transcript display */}
        <div className="sp-transcript">
          {transcript ? (
            <span>{transcript}</span>
          ) : (
            <span className="sp-transcript-placeholder">
              {transEnabled ? 'Speak into your microphone...' : 'Enable transcription to capture speech'}
            </span>
          )}
          {transEnabled && <span className="cursor" />}
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
