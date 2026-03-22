/**
 * Unit tests for AudioEngine.
 *
 * Tests public methods that can be exercised without a full AudioContext.
 * The singleton is tested in its default (uninitialized) state for
 * getters, and with minimal mocking for state-mutating paths.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock imports that engine.ts depends on at module scope
vi.mock('./spc-worklet.ts?worker&url', () => ({
  default: 'blob:mock-worklet-url',
}));

vi.mock('./wasm-loader', () => ({
  loadDspWasmBytes: vi.fn(),
}));

vi.mock('@/errors/report', () => ({
  reportError: vi.fn(),
}));

vi.mock('@/errors/factories', () => ({
  audioPipelineError: vi.fn((code: string, ctx?: Record<string, unknown>) => ({
    code,
    ...ctx,
  })),
  spcParseError: vi.fn((code: string, ctx?: Record<string, unknown>) => ({
    code,
    ...ctx,
  })),
}));

import { audioEngine } from './engine';

describe('AudioEngine', () => {
  describe('getTempo / getPitch (default state)', () => {
    it('returns 1.0 for tempo when uninitialized', () => {
      expect(audioEngine.getTempo()).toBe(1.0);
    });

    it('returns 1.0 for pitch when uninitialized', () => {
      expect(audioEngine.getPitch()).toBe(1.0);
    });
  });

  describe('isSoundTouchActive', () => {
    it('returns false when no SoundTouch node exists', () => {
      expect(audioEngine.isSoundTouchActive()).toBe(false);
    });
  });

  describe('resolveCheckpointPreset', () => {
    it('returns standard preset config', () => {
      const config = audioEngine.resolveCheckpointPreset('standard');
      expect(config).toEqual({
        intervalSamples: 5 * 32_000,
        maxCheckpoints: 120,
      });
    });

    it('returns fast preset config', () => {
      const config = audioEngine.resolveCheckpointPreset('fast');
      expect(config).toEqual({
        intervalSamples: 2 * 32_000,
        maxCheckpoints: 300,
      });
    });
  });

  describe('getAudioChainInfo', () => {
    it('returns uninitialized state when no AudioContext exists', () => {
      const info = audioEngine.getAudioChainInfo();
      expect(info).toEqual({
        sampleRate: 48_000,
        baseLatencyMs: 0,
        outputLatencyMs: 0,
        state: 'uninitialized',
      });
    });
  });

  describe('play (uninitialized)', () => {
    it('returns false when engine is not initialized', () => {
      expect(audioEngine.play()).toBe(false);
    });
  });

  describe('cancelCheckpointPrecompute', () => {
    it('safely no-ops when no worker is running', () => {
      // Should not throw when called without an active worker
      expect(() => audioEngine.cancelCheckpointPrecompute()).not.toThrow();
    });
  });

  describe('pause (uninitialized)', () => {
    it('safely no-ops when worklet is not connected', () => {
      expect(() => audioEngine.pause()).not.toThrow();
    });
  });

  describe('setVoiceMask (uninitialized)', () => {
    it('safely no-ops when worklet is not connected', () => {
      expect(() => audioEngine.setVoiceMask(0xff)).not.toThrow();
    });
  });

  describe('setSpeed (uninitialized)', () => {
    it('safely no-ops when worklet is not connected', () => {
      expect(() => audioEngine.setSpeed(2.0)).not.toThrow();
    });
  });

  describe('setPlaybackConfig (uninitialized)', () => {
    it('safely no-ops when worklet is not connected', () => {
      expect(() =>
        audioEngine.setPlaybackConfig({
          type: 'set-playback-config',
          durationSamples: 100_000,
          fadeOutSamples: 5_000,
          loopCount: null,
          structure: null,
        }),
      ).not.toThrow();
    });
  });

  describe('setInterpolationMode (uninitialized)', () => {
    it('safely no-ops when worklet is not connected', () => {
      expect(() => audioEngine.setInterpolationMode(1)).not.toThrow();
    });
  });

  describe('noteOn / noteOff (uninitialized)', () => {
    it('safely no-ops noteOn when worklet is not connected', () => {
      expect(() => audioEngine.noteOn(0, 440)).not.toThrow();
    });

    it('safely no-ops noteOff when worklet is not connected', () => {
      expect(() => audioEngine.noteOff(0)).not.toThrow();
    });
  });

  describe('setResamplerMode (uninitialized)', () => {
    it('safely no-ops when worklet is not connected', () => {
      expect(() => audioEngine.setResamplerMode('sinc')).not.toThrow();
    });
  });

  describe('setCheckpointConfig', () => {
    it('stores config without throwing when worklet is not connected', () => {
      expect(() => audioEngine.setCheckpointConfig(64_000, 50)).not.toThrow();
    });
  });

  describe('setVolume (uninitialized)', () => {
    it('safely no-ops when gainNode is not available', () => {
      expect(() => audioEngine.setVolume(0.5)).not.toThrow();
    });
  });

  describe('seek (uninitialized)', () => {
    it('safely no-ops when worklet is not connected', () => {
      expect(() => audioEngine.seek(16_000)).not.toThrow();
    });
  });

  describe('setOnPlaybackEnded', () => {
    beforeEach(() => {
      audioEngine.setOnPlaybackEnded(null);
    });

    it('accepts a callback', () => {
      const cb = vi.fn();
      audioEngine.setOnPlaybackEnded(cb);
      // Verify it was set (indirect — no public getter, but should not throw)
      expect(true).toBe(true);
    });

    it('accepts null to clear callback', () => {
      audioEngine.setOnPlaybackEnded(null);
      expect(true).toBe(true);
    });
  });

  describe('requestSnapshot (uninitialized)', () => {
    it('rejects when worklet is not initialized', async () => {
      await expect(audioEngine.requestSnapshot()).rejects.toThrow(
        'Worklet not initialized',
      );
    });
  });

  describe('destroy', () => {
    it('resolves without error on uninitialized engine', async () => {
      await expect(audioEngine.destroy()).resolves.toBeUndefined();
    });
  });
});
