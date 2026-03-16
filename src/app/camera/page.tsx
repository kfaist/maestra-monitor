'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const POST_URL = '/api/frame/browser';
const INTERVAL_MS = 80; // ~12fps
const QUALITY = 0.7;
const WIDTH = 640;
const HEIGHT = 480;

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('starting...');
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const lastSendRef = useRef(0);
  const frameCountRef = useRef(0);
  const fpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const sendFrame = useCallback(() => {
    if (!mountedRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(sendFrame);
      return;
    }

    const now = Date.now();
    if (sendingRef.current || now - lastSendRef.current < INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(sendFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(sendFrame);
      return;
    }

    ctx.drawImage(video, 0, 0, WIDTH, HEIGHT);
    sendingRef.current = true;
    lastSendRef.current = now;

    canvas.toBlob(
      (blob) => {
        if (!blob || !mountedRef.current) {
          sendingRef.current = false;
          rafRef.current = requestAnimationFrame(sendFrame);
          return;
        }

        fetch(POST_URL, {
          method: 'POST',
          body: blob,
          headers: { 'Content-Type': 'image/jpeg' },
        })
          .then((res) => {
            sendingRef.current = false;
            if (res.ok) {
              frameCountRef.current++;
              setStatus('live');
              setError(null);
            } else {
              setStatus(`error ${res.status}`);
            }
          })
          .catch((err) => {
            sendingRef.current = false;
            setError(err.message);
            setStatus('error - retrying');
          });

        rafRef.current = requestAnimationFrame(sendFrame);
      },
      'image/jpeg',
      QUALITY,
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // FPS counter
    fpsIntervalRef.current = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    // Start camera
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: WIDTH }, height: { ideal: HEIGHT } },
        audio: false,
      })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStatus('live');
          // Start capture loop
          rafRef.current = requestAnimationFrame(sendFrame);
        }
      })
      .catch((err) => {
        setError('Camera error: ' + err.message);
        setStatus('camera denied');
      });

    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fpsIntervalRef.current) clearInterval(fpsIntervalRef.current);
      // Stop camera tracks
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [sendFrame]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={{ display: 'none' }} />

      {/* Status overlay */}
      <div style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        right: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: status === 'live' ? '#22c55e' : '#ef4444',
        opacity: 0.8,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: status === 'live' ? '#22c55e' : '#ef4444',
            boxShadow: `0 0 8px ${status === 'live' ? '#22c55e' : '#ef4444'}`,
          }} />
          <span>{status}</span>
          {fps > 0 && <span style={{ color: '#5cc8ff' }}>{fps} fps</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#888', fontSize: 10 }}>{WIDTH}x{HEIGHT}</span>
          <span style={{ color: '#888', fontSize: 10 }}>POST {POST_URL}</span>
        </div>
      </div>

      {error && (
        <div style={{
          position: 'fixed',
          top: 12,
          left: 12,
          right: 12,
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 6,
          color: '#ef4444',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          zIndex: 10,
        }}>
          {error}
        </div>
      )}

      {/* TD instructions */}
      <div style={{
        position: 'fixed',
        top: 12,
        right: 12,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(92,200,255,0.2)',
        borderRadius: 6,
        color: '#aab',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        lineHeight: 1.6,
        zIndex: 10,
        maxWidth: 300,
      }}>
        <div style={{ color: '#5cc8ff', fontWeight: 700, marginBottom: 4 }}>TD Input</div>
        <div>Web Client DAT → fetch URL:</div>
        <div style={{ color: '#22c55e', wordBreak: 'break-all' }}>
          {typeof window !== 'undefined' ? window.location.origin : ''}/api/frame/browser
        </div>
      </div>
    </div>
  );
}
