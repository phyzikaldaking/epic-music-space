"use client";

export type StudioTransportState = {
  playing: boolean;
  positionSec: number;
  bpm: number;
};

type Listener = (state: StudioTransportState) => void;

class StudioTransport {
  private state: StudioTransportState = { playing: false, positionSec: 0, bpm: 120 };
  private listeners = new Set<Listener>();
  private frame: number | null = null;
  private origin = 0;
  private positionAtStart = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): StudioTransportState {
    return { ...this.state };
  }

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    this.state = { ...this.state, bpm };
    this.emit();
  }

  seek(positionSec: number): void {
    this.state = { ...this.state, positionSec: Math.max(0, positionSec) };
    if (this.state.playing) {
      this.positionAtStart = this.state.positionSec;
      this.origin = performance.now() / 1000;
    }
    this.emit();
  }

  play(): void {
    if (this.state.playing) return;
    this.positionAtStart = this.state.positionSec;
    this.origin = performance.now() / 1000;
    this.state = { ...this.state, playing: true };
    this.emit();
    this.schedule();
  }

  stop(reset = false): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.state = { ...this.state, playing: false, positionSec: reset ? 0 : this.position() };
    this.emit();
  }

  private position(): number {
    return this.state.playing ? this.positionAtStart + performance.now() / 1000 - this.origin : this.state.positionSec;
  }

  private schedule(): void {
    if (!this.state.playing) return;
    this.state = { ...this.state, positionSec: this.position() };
    this.emit();
    this.frame = requestAnimationFrame(() => this.schedule());
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const studioTransport = new StudioTransport();
