import { describe, expect, it } from "vitest";
import { buildWaveformEnvelope, reduceWaveformEnvelope, waveformEnvelopeCacheKey } from "@/app/studio/try/studio/audio";

describe("Studio zoom-aware waveforms", () => {
  it("preserves independent channel minimum and maximum peaks", () => {
    const envelope = buildWaveformEnvelope([new Float32Array([-1, -.5, .25, .75]), new Float32Array([.1, .2, -.3, -.4])], 2);
    expect(envelope.channels[0]).toEqual([{ min: -1, max: -.5 }, { min: .25, max: .75 }]);
    expect(envelope.channels[1]).toEqual([{ min: .1, max: .2 }, { min: -.4, max: -.3 }]);
  });

  it("reduces long waveforms for zoom while preserving extrema and silence", () => {
    const envelope = buildWaveformEnvelope([new Float32Array([-1, 0, .5, 1, 0, 0, 0, 0])], 1);
    expect(reduceWaveformEnvelope(envelope, 2).channels[0]).toEqual([{ min: -1, max: 1 }, { min: 0, max: 0 }]);
    expect(buildWaveformEnvelope([new Float32Array(100_000)], 1000).channels[0]).toHaveLength(100);
  });

  it("uses stable source, channel, sample-rate and resolution cache identity", () => {
    const descriptor = { sourceId: "source-1", sampleRate: 48_000, channelCount: 2, samplesPerBucket: 256, startFrame: 0, endFrame: 96_000 };
    expect(waveformEnvelopeCacheKey(descriptor)).toBe(waveformEnvelopeCacheKey({ ...descriptor }));
    expect(waveformEnvelopeCacheKey(descriptor)).not.toBe(waveformEnvelopeCacheKey({ ...descriptor, samplesPerBucket: 512 }));
  });
});
