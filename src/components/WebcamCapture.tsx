'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface WebcamCaptureProps {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  onFrame: (blobUrl: string, fps: number) => void;
  onError?: (message: string) => void;
  onFrameData?: (base64: string) => void;
  captureInterval?: number;
  quality?: number;
  width?: number;
  height?: number;
  hidePreview?: boolean;
}

const DEFAULT_INTERVAL = 80; // ~12fps — reliable without overwhelming
const DEFAULT_QUALITY = 0.65;
const FRAME_BUFFER_URL = '/api/frame/browser';

export default function WebcamCapture({
  active,
  onActiveChange,
  onFrame,
  onError,
  onFrameData,
  captureInterval = DEFAULT_INTERVAL,
  quality = DEFAULT_QUALITY,
  width = 640,
  height = 480,
  hidePreview = false,
}: WebcamCaptureProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'live' | 'error'>('idle');
  const [resolution, setResolution] = useState({ w: 0, h: 0 });
  const [fps, setFps] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [relayEnabled, setRelayEnabled] = useState(false);
  const [tdRelayActive, setTdRelayActive] = useState(true); // POST frames to /api/frame/browser for TD
  const [tdRelayStatus, setTdRelayStatus] = useState<'idle' | 'ok' | 'err'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCaptureRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const prevBlobUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const frameCountRef = useRef(0);

  // Stable refs for callbacks
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onFrameDataRef = useRef(onFrameData);
  onFrameDataRef.current = onFrameData;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const relayEnabledRef = useRef(relayEnabled);
  relayEnabledRef.current = relayEnabled;
  const tdRelayActiveRef = useRef(tdRelayActive);
  tdRelayActiveRef.current = tdRelayActive;
  const tdPostingRef = useRef(false);
  const intervalRef = useRef(captureInterval);
  intervalRef.current = captureInterval;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Enumerate cameras
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.()
      .then(all => {
        const cams = all.filter(d => d.kind === 'videoinput');
        setDevices(cams);
        if (cams.length > 0 && !selectedDevice) {
          setSelectedDevice(cams[0].deviceId);
        }
      })
      .catch(() => {});
  }, [selectedDevice]);

  // The capture loop — runs via requestAnimationFrame, throttled by captureInterval
  const captureLoop = useCallback(() => {
    if (!mountedRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      // Video not ready yet, keep trying
      rafRef.current = requestAnimationFrame(captureLoop);
      return;
    }

    const now = performance.now();
    const elapsed = now - lastCaptureRef.current;

    if (elapsed >= intervalRef.current) {
      lastCaptureRef.current = now;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // FPS tracking
        frameTimesRef.current.push(now);
        frameTimesRef.current = frameTimesRef.current.filter(t => now - t < 1000);
        if (frameTimesRef.current.length >= 2) {
          const span = (frameTimesRef.current[frameTimesRef.current.length - 1] - frameTimesRef.current[0]) / 1000;
          if (span > 0) setFps(Math.round((frameTimesRef.current.length - 1) / span));
        }

        // Export JPEG blob
        canvas.toBlob((blob) => {
          if (!blob || !mountedRef.current) return;

          if (prevBlobUrlRef.current) {
            URL.revokeObjectURL(prevBlobUrlRef.current);
          }
          const url = URL.createObjectURL(blob);
          prevBlobUrlRef.current = url;

          frameCountRef.current++;
          setFrameCount(frameCountRef.current);

          // Send frame to parent
          onFrameRef.current(url, frameTimesRef.current.length);

          // POST to /api/frame/browser for TD to poll
          if (tdRelayActiveRef.current && !tdPostingRef.current) {
            tdPostingRef.current = true;
            fetch(FRAME_BUFFER_URL, {
              method: 'POST',
              body: blob,
              headers: { 'Content-Type': 'image/jpeg' },
            })
              .then(res => {
                tdPostingRef.current = false;
                setTdRelayStatus(res.ok ? 'ok' : 'err');
              })
              .catch(() => {
                tdPostingRef.current = false;
                setTdRelayStatus('err');
              });
          }

          // Optional WS relay
          if (relayEnabledRef.current && onFrameDataRef.current) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const b64 = (reader.result as string)?.split(',')[1];
              if (b64) onFrameDataRef.current?.(b64);
            };
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', qualityRef.current);
      }
    }

    rafRef.current = requestAnimationFrame(captureLoop);
  }, []);

  const startCapture = useCallback(async (deviceId?: string) => {
    // Clean up any existing capture
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    setStatus('requesting');
    setFrameCount(0);
    frameCountRef.current = 0;
    frameTimesRef.current = [];
    lastCaptureRef.current = 0;

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: 30 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      setHasPermission(true);

      // Re-enumerate for labels
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(cameras);

      // Attach to video
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('Video element error'));
          // Timeout safety
          setTimeout(() => resolve(), 3000);
        });
        await video.play();

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        setResolution({ w: settings.width || video.videoWidth || width, h: settings.height || video.videoHeight || height });
      }

      setStatus('live');

      // Start the capture loop
      rafRef.current = requestAnimationFrame(captureLoop);

    } catch (err) {
      const msg = (err as Error).message || 'Camera access denied';
      setStatus('error');
      setHasPermission(false);
      onErrorRef.current?.(msg);
    }
  }, [width, height, captureLoop]);

  const stopCapture = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
    setFps(0);
    setFrameCount(0);
    frameTimesRef.current = [];
  }, []);

  // React to active prop
  useEffect(() => {
    if (active) {
      startCapture(selectedDevice || undefined);
    } else {
      stopCapture();
    }
    return () => { stopCapture(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const switchCamera = useCallback((deviceId: string) => {
    setSelectedDevice(deviceId);
    if (active) startCapture(deviceId);
  }, [active, startCapture]);

  return (
    <div className="webcam-capture">
      <div className="webcam-header">
        <div className="webcam-title-row">
          <span className="webcam-title">Webcam</span>
          {status === 'live' && (
            <>
              <span className="webcam-fps-badge">{fps} FPS</span>
              <span className="webcam-res-badge">{resolution.w}×{resolution.h}</span>
              <span className="webcam-frame-count">{frameCount} frames</span>
            </>
          )}
          {status === 'requesting' && (
            <span className="webcam-status-badge requesting">requesting camera…</span>
          )}
        </div>
        <div className="webcam-controls">
          {status === 'live' && (
            <button
              className="webcam-td-relay-btn"
              onClick={() => setTdRelayActive(!tdRelayActive)}
              style={{
                padding: '2px 8px',
                fontSize: 9,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                border: `1px solid ${tdRelayActive ? (tdRelayStatus === 'ok' ? '#22c55e' : '#666') : '#333'}`,
                borderRadius: 4,
                background: tdRelayActive && tdRelayStatus === 'ok' ? 'rgba(34,197,94,0.12)' : 'transparent',
                color: tdRelayActive ? (tdRelayStatus === 'ok' ? '#22c55e' : '#888') : '#555',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              title="POST frames to /api/frame/browser for TD to poll"
            >
              {tdRelayActive ? (tdRelayStatus === 'ok' ? '● TD' : '○ TD') : 'TD OFF'}
            </button>
          )}
          {onFrameData && status === 'live' && (
            <label className="toggle webcam-relay-toggle" title="Relay frames to other monitors via WS">
              <input
                type="checkbox"
                checked={relayEnabled}
                onChange={(e) => setRelayEnabled(e.target.checked)}
              />
              <div className="toggle-track">
                <div className="toggle-thumb" />
              </div>
              <span className="toggle-label">Relay</span>
            </label>
          )}
          <button
            className={`webcam-btn ${active ? 'webcam-btn-stop' : 'webcam-btn-start'}`}
            onClick={() => onActiveChange(!active)}
            disabled={status === 'requesting'}
          >
            {active ? (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" /></svg>
                Stop
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Start Cam
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live camera preview — only shown if hidePreview is false */}
      {active && !hidePreview && (
        <div className="webcam-preview">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
          />
        </div>
      )}

      {/* Hidden video element — always needed for capture even when preview hidden */}
      {(!active || hidePreview) && (
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ display: 'none' }}
        />
      )}

      {/* Camera selector */}
      {devices.length > 1 && (
        <div className="webcam-device-select">
          <select value={selectedDevice} onChange={(e) => switchCamera(e.target.value)}>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* TD polling info */}
      {status === 'live' && tdRelayActive && (
        <div className="webcam-td-info" style={{
          margin: '6px 0 0',
          padding: '5px 8px',
          background: 'rgba(92,200,255,0.06)',
          border: '1px solid rgba(92,200,255,0.15)',
          borderRadius: 4,
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          color: '#888',
          lineHeight: 1.5,
        }}>
          <span style={{ color: '#5cc8ff' }}>TD → Web Client DAT</span>{' '}
          poll: <code style={{ color: '#aab' }}>{typeof window !== 'undefined' ? window.location.origin : ''}/api/frame/browser</code>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="webcam-error">
          Camera access denied. Check browser permissions and try again.
        </div>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
