'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TranscriptionBarProps {
  onNounsDetected?: (nouns: string[]) => void;
  onTranscriptChange?: (text: string) => void;
}

// Simple noun extraction — common verbs/prepositions/articles to skip
const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','can','may','might','shall',
  'i','you','he','she','it','we','they','me','him','her','us','them','my','your',
  'his','its','our','their','this','that','these','those','what','which','who',
  'whom','where','when','why','how','all','each','every','both','few','more',
  'most','other','some','such','no','not','only','own','same','so','than','too',
  'very','just','and','but','or','nor','for','yet','with','from','into','to',
  'in','on','at','by','of','up','out','off','over','under','about','after',
  'before','between','through','during','without','again','further','then','once',
  'here','there','when','where','why','how','also','back','now','still','already',
  'let','get','got','go','going','come','coming','take','make','like','thing',
  'things','really','right','okay','yeah','yes','no','um','uh','oh','ah',
]);

function extractNouns(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i) // dedupe
    .slice(0, 12);
}

export default function TranscriptionBar({ onNounsDetected, onTranscriptChange }: TranscriptionBarProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [nouns, setNouns] = useState<string[]>([]);
  const [freshNouns, setFreshNouns] = useState<Set<string>>(new Set());
  const recognitionRef = useRef<unknown>(null);
  const freshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const SpeechRecognition = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }

      const text = final || interim;
      setTranscript(text);
      onTranscriptChange?.(text);

      if (final) {
        const detected = extractNouns(final);
        if (detected.length > 0) {
          setNouns(prev => {
            const merged = [...new Set([...detected, ...prev])].slice(0, 20);
            return merged;
          });
          setFreshNouns(new Set(detected));
          onNounsDetected?.(detected);

          // Clear fresh highlight after 3s
          if (freshTimerRef.current) clearTimeout(freshTimerRef.current);
          freshTimerRef.current = setTimeout(() => setFreshNouns(new Set()), 3000);
        }
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (recognitionRef.current === recognition) {
        try { recognition.start(); } catch { setListening(false); }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [onNounsDetected, onTranscriptChange]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = recognitionRef.current as any;
      recognitionRef.current = null;
      r.stop();
    }
    setListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (recognitionRef.current) (recognitionRef.current as any).stop();
      if (freshTimerRef.current) clearTimeout(freshTimerRef.current);
    };
  }, []);

  return (
    <div className="scene-bar" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
        }}>
          Speech → Nouns
        </div>
        <button
          onClick={listening ? stopListening : startListening}
          style={{
            fontSize: 9, padding: '3px 10px', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontWeight: 700,
            background: listening ? 'rgba(239,68,68,0.15)' : 'rgba(0,212,255,0.1)',
            border: `1px solid ${listening ? 'rgba(239,68,68,0.3)' : 'rgba(0,212,255,0.2)'}`,
            color: listening ? '#ef4444' : '#00d4ff',
            borderRadius: 3,
          }}
        >
          {listening ? '● STOP' : '○ LISTEN'}
        </button>
      </div>

      {/* Transcript line */}
      <div className="sp-transcript" style={{ minHeight: 32, maxHeight: 48, marginBottom: 0, marginTop: 6 }}>
        {transcript ? (
          <span className="scene-bar-transcript-text">{transcript}</span>
        ) : (
          <span className="sp-transcript-placeholder">
            {listening ? 'Listening...' : 'Click LISTEN to start speech recognition'}
          </span>
        )}
      </div>

      {/* Noun tags */}
      {nouns.length > 0 && (
        <div className="scene-bar-nouns" style={{ marginTop: 6 }}>
          {nouns.map(noun => (
            <span
              key={noun}
              className={`scene-bar-noun ${freshNouns.has(noun) ? 'fresh' : ''}`}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('text/plain', noun);
                const ghost = document.createElement('div');
                ghost.textContent = noun;
                ghost.style.cssText = 'position:fixed;top:-100px;padding:3px 8px;background:rgba(0,212,255,0.9);color:#000;font:700 10px monospace;border-radius:3px;z-index:9999;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                setTimeout(() => document.body.removeChild(ghost), 0);
              }}
              style={{ cursor: 'grab' }}
              title={`Drag "${noun}" to a prompt field`}
            >
              {noun}
            </span>
          ))}
          <button
            onClick={() => { setNouns([]); setTranscript(''); }}
            style={{
              fontSize: 8, padding: '1px 5px', cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.3)', borderRadius: 2,
            }}
          >
            clear
          </button>
        </div>
      )}
    </div>
  );
}
