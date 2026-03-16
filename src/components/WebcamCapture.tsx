'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface WebcamCaptureProps {
  /** Whether the webcam should be active */
  active: boolean;
  /** Called when webcam starts/stops */
  onActiveChange: (active: boolean) => void;
  /** Called with each captured frame as a blob URL */
  onFrame: (blobUrl: string, fps: number) => void;
  /** Called when webcam encounters an error */
  onError?: (message: string) => void;
  /** Optional: send frame data via WebSocket for relay */
  onFrameData?: (base64: string) => void;
  /** Capture interval in ms (default 55ms ≈ 18fps) */
  captureInterval?: number;
  /** JPEG quality 0-1 (default 0.6) */
  quality?: number;
  /** Target resolution width (default 640) */
  width?: number;
  /** Target resolution height (default 480) */
  height?: number;
}

const DEFAULT_INTERVAL = 55;
const DEFAULT_QUALITY = 0.6;
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;

export default function WebcamCapture({
  active,
  onActiveChange,
  onFrame,
  onError,
  onFrameData,
  captureInterval = DEFAULT_INTERVAL,
  quality = DEFAULT_QUALITY,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: WebcamCaptureProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [resolution, setResolution] = useState({ w: 0, h: 0 });
  const [captureFps, setCaptureFps] = useState(0);
  const [relayEnabled, setRelayEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const prevBlobUrlRef = useRef<string | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onFrameDataRef = useRef(onFrameData);
  onFrameDataRef.current = onFrameData;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Enumerate cameras on mount
  useEffect(() => {
    async function enumerate() {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const cameras = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(cameras);
        if (cameras.length > 0 && !selectedDevice) {
          setSelectedDevice(cameras[0].deviceId);
        }
      } catch {
        // Permission not yet granted — devices will be re-enumerated after getUserMedia
      }
    }
    enumerate();
  }, [selectedDevice]);

  // Start/stop capture
  const startCapture = useCallback(async (deviceId?: string) => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }

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
      streamRef.current = stream;
      setHasPermission(true);

      // Re-enumerate now that we have permission (labels become available)
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(cameras);
      if (!deviceId && cameras.length > 0) {
        setSelectedDevice(cameras[0].deviceId);
      }

      // Attach to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        setResolution({ w: settings.width || width, h: settings.height || height });
      }

      // Start frame capture loop
      frameTimesRef.current = [];
      captureTimerRef.current = setInterval(() => {
        captureFrame();
      }, captureInterval);

    } catch (err) {
      const msg = (err as Error).message || 'Camera access denied';
      setHasPermission(false);
      onErrorRef.current?.(msg);
    }
  }, [width, height, captureInterval]);

  const stopCapture = useCallback(() => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCaptureFps(0);
    setResolution({ w: 0, h: 0 });
    frameTimesRef.current = [];
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Calculate FPS
    const now = performance.now();
    frameTimesRef.current.push(now);
    frameTimesRef.current = frameTimesRef.current.filter(t => now - t < 1000);
    if (frameTimesRef.current.length >= 2) {
      const span = (frameTimesRef.current[frameTimesRef.current.length - 1] - frameTimesRef.current[0]) / 1000;
      const fps = Math.round((frameTimesRef.current.length - 1) / span);
      setCaptureFps(fps);
    }

    // Export as JPEG blob URL
    canvas.toBlob((blob) => {
      if (!blob) return;

      // Revoke previous blob
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      prevBlobUrlRef.current = url;
      onFrameRef.current(url, captureFps);

      // Optionally relay base64 via WebSocket
      if (relayEnabled && onFrameDataRef.current) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          if (base64) onFrameDataRef.current?.(base64);
        };
        reader.readAsDataURL(blob);
      }
    }, 'image/jpeg', quality);
  }, [quality, relayEnabled, captureFps]);

  // React to active prop changes
  useEffect(() => {
    if (active) {
      startCapture(selectedDevice || undefined);
    } else {
      stopCapture();
    }
    return () => {
      stopCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Switch camera while active
  const switchCamera = useCallback((deviceId: string) => {
    setSelectedDevice(deviceId);
    if (active) {
      startCapture(deviceId);
    }
  }, [active, startCapture]);

  return (
    <div className="webcam-capture">
      <div className="webcam-header">
        <div className="webcam-title-row">
          <span className="webcam-title">Webcam</span>
          {active && captureFps > 0 && (
            <span className="webcam-fps-badge">{captureFps} FPS</span>
          )}
          {active && resolution.w > 0 && (
            <span className="webcam-res-badge">{resolution.w}×{resolution.h}</span>
          )}
        </div>
        <div className="webcam-controls">
          {onFrameData && active && (
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

      {/* Camera selector — only show when we have multiple cameras */}
      {devices.length > 1 && (
        <div className="webcam-device-select">
          <select
            value={selectedDevice}
            onChange={(e) => switchCamera(e.target.value)}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Permission denied message */}
      {hasPermission === false && (
        <div className="webcam-error">
          Camera access denied. Check browser permissions and try again.
        </div>
      )}

      {/* Hidden video + canvas for frame capture */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ display: 'none' }}
      />
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
    </div>
  );
}
