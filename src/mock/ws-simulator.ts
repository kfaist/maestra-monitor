import { WSEvent, WSEventType, AudioAnalysisData } from '@/types';

type EventHandler = (event: WSEvent) => void;

export class WSSimulator {
  private handlers: EventHandler[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private simTime = 0;
  private audioData: AudioAnalysisData = {
    sub: 65, bass: 82, mid: 45, high: 73, rms: 0.76, bpm: 128,
    drums: 88, stemBass: 70, vocals: 56, melody: 62, keys: 44, other: 38,
    peak: 94,
  };

  subscribe(handler: EventHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  private emit(event: WSEvent) {
    this.handlers.forEach(h => h(event));
  }

  start() {
    if (this.interval) return;

    // Heartbeat every 5s
    setInterval(() => {
      this.emit({
        type: 'heartbeat',
        entity_id: '576f16e7-873f-4ace-9e59-f7c0a5ed9110',
        timestamp: Date.now(),
        data: { status: 'alive' },
      });
    }, 5000);

    // Audio simulation at 60fps
    this.interval = setInterval(() => {
      this.simTime += 0.016;
      this.simulateAudio();
      this.emit({
        type: 'audio_analysis',
        timestamp: Date.now(),
        data: { ...this.audioData } as unknown as Record<string, unknown>,
      });
    }, 16);

    // Random state updates
    setInterval(() => {
      const events: WSEventType[] = ['state_update', 'stream_advertised'];
      const type = events[Math.floor(Math.random() * events.length)];
      this.emit({
        type,
        entity_id: '576f16e7-873f-4ace-9e59-f7c0a5ed9110',
        timestamp: Date.now(),
        data: type === 'state_update'
          ? { brightness: Math.round(Math.random() * 100), scene: Math.floor(Math.random() * 5) }
          : { stream_name: 'Stage Visuals', stream_type: 'ndi' },
      });
    }, 8000);

    // Initial entity_connected event
    setTimeout(() => {
      this.emit({
        type: 'entity_connected',
        entity_id: '576f16e7-873f-4ace-9e59-f7c0a5ed9110',
        timestamp: Date.now(),
        data: { name: 'Krista1', type: 'touchdesigner' },
      });
    }, 500);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getAudioData(): AudioAnalysisData {
    return { ...this.audioData };
  }

  private simulateAudio() {
    const t = this.simTime;
    const beat = (t * (this.audioData.bpm / 60)) % 1;
    const beatPulse = Math.pow(Math.max(0, 1 - beat * 3), 2);

    this.audioData.sub = 55 + beatPulse * 35 + Math.sin(t * 0.7) * 8;
    this.audioData.bass = 65 + beatPulse * 25 + Math.sin(t * 1.1) * 10;
    this.audioData.mid = 35 + Math.sin(t * 2.3) * 18 + Math.random() * 6;
    this.audioData.high = 50 + Math.sin(t * 3.7) * 22 + Math.random() * 8;
    this.audioData.rms = 0.55 + beatPulse * 0.28 + Math.sin(t * 0.9) * 0.08;
    this.audioData.drums = 60 + beatPulse * 38 + Math.random() * 5;
    this.audioData.stemBass = 55 + beatPulse * 30 + Math.sin(t * 0.6) * 12;
    this.audioData.vocals = 30 + Math.sin(t * 1.8) * 25 + Math.random() * 8;
    this.audioData.melody = 45 + Math.sin(t * 2.1) * 20 + Math.random() * 6;
    this.audioData.keys = 30 + Math.sin(t * 1.5) * 18 + Math.random() * 5;
    this.audioData.other = 25 + Math.sin(t * 0.8) * 15 + Math.random() * 4;
    this.audioData.peak = Math.max(this.audioData.sub, this.audioData.bass, this.audioData.drums);
  }
}
