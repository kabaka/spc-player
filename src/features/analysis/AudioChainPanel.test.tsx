import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  audioStateBuffer,
  resetAudioStateBuffer,
} from '@/audio/audio-state-buffer';

import { AudioChainPanel } from './AudioChainPanel';

// Mock audioEngine.getAudioChainInfo
vi.mock('@/audio/engine', () => ({
  audioEngine: {
    getAudioChainInfo: vi.fn().mockReturnValue({
      sampleRate: 48000,
      baseLatencyMs: 5.3,
      outputLatencyMs: 8.0,
      state: 'running',
    }),
  },
}));

beforeEach(() => {
  resetAudioStateBuffer();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AudioChainPanel', () => {
  it('renders section with accessible label', () => {
    render(<AudioChainPanel />);
    expect(
      screen.getByRole('region', { name: 'Audio chain diagnostics' }),
    ).toBeInTheDocument();
  });

  it('displays DSP native rate', () => {
    render(<AudioChainPanel />);
    expect(screen.getByText('32,000 Hz')).toBeInTheDocument();
  });

  it('displays the shared mode note', () => {
    render(<AudioChainPanel />);
    expect(
      screen.getByText(/Exclusive\/ASIO mode is not available/),
    ).toBeInTheDocument();
  });
});

describe('telemetry handler: DSP registers', () => {
  it('correctly copies 128-byte ArrayBuffer to audioStateBuffer.dspRegisters', () => {
    const regData = new ArrayBuffer(128);
    const view = new Uint8Array(regData);
    // Set some known register values
    view[0x0c] = 0x7f; // MVOLL
    view[0x1c] = 0x7f; // MVOLR
    view[0x4c] = 0xff; // KON

    audioStateBuffer.dspRegisters.set(new Uint8Array(regData));

    expect(audioStateBuffer.dspRegisters[0x0c]).toBe(0x7f);
    expect(audioStateBuffer.dspRegisters[0x1c]).toBe(0x7f);
    expect(audioStateBuffer.dspRegisters[0x4c]).toBe(0xff);
    expect(audioStateBuffer.dspRegisters[0]).toBe(0);
  });
});

describe('telemetry handler: CPU registers', () => {
  it('correctly parses 8-byte layout into named fields', () => {
    const cpuData = new ArrayBuffer(8);
    const view = new Uint8Array(cpuData);
    // Layout: [A, X, Y, SP, PC_lo, PC_hi, PSW, padding]
    view[0] = 0x42; // A
    view[1] = 0x10; // X
    view[2] = 0x20; // Y
    view[3] = 0xef; // SP
    view[4] = 0x00; // PC low byte
    view[5] = 0x04; // PC high byte → PC = 0x0400
    view[6] = 0x02; // PSW

    const cpu = new Uint8Array(cpuData);
    audioStateBuffer.cpuRegisters.a = cpu[0];
    audioStateBuffer.cpuRegisters.x = cpu[1];
    audioStateBuffer.cpuRegisters.y = cpu[2];
    audioStateBuffer.cpuRegisters.sp = cpu[3];
    audioStateBuffer.cpuRegisters.pc = cpu[4] | (cpu[5] << 8);
    audioStateBuffer.cpuRegisters.psw = cpu[6];

    expect(audioStateBuffer.cpuRegisters.a).toBe(0x42);
    expect(audioStateBuffer.cpuRegisters.x).toBe(0x10);
    expect(audioStateBuffer.cpuRegisters.y).toBe(0x20);
    expect(audioStateBuffer.cpuRegisters.sp).toBe(0xef);
    expect(audioStateBuffer.cpuRegisters.pc).toBe(0x0400);
    expect(audioStateBuffer.cpuRegisters.psw).toBe(0x02);
  });

  it('handles PC with both bytes set', () => {
    const cpuData = new Uint8Array([0, 0, 0, 0, 0xcd, 0xab, 0, 0]);
    audioStateBuffer.cpuRegisters.pc = cpuData[4] | (cpuData[5] << 8);
    expect(audioStateBuffer.cpuRegisters.pc).toBe(0xabcd);
  });
});

describe('telemetry handler: RAM snapshot', () => {
  it('copies 64KB ArrayBuffer to audioStateBuffer.ramCopy', () => {
    const ram = new ArrayBuffer(65536);
    const view = new Uint8Array(ram);
    view[0x0000] = 0xaa;
    view[0x00ff] = 0xbb;
    view[0xfffe] = 0xcc;

    audioStateBuffer.ramCopy.set(new Uint8Array(ram));

    expect(audioStateBuffer.ramCopy[0x0000]).toBe(0xaa);
    expect(audioStateBuffer.ramCopy[0x00ff]).toBe(0xbb);
    expect(audioStateBuffer.ramCopy[0xfffe]).toBe(0xcc);
    expect(audioStateBuffer.ramCopy[0x8000]).toBe(0);
  });
});

describe('audio stats to audioStateBuffer', () => {
  it('updates processLoadPercent and totalUnderruns', () => {
    audioStateBuffer.processLoadPercent = 42.5;
    audioStateBuffer.totalUnderruns = 3;

    expect(audioStateBuffer.processLoadPercent).toBe(42.5);
    expect(audioStateBuffer.totalUnderruns).toBe(3);
  });

  it('resets to zero on resetAudioStateBuffer', () => {
    audioStateBuffer.processLoadPercent = 50;
    audioStateBuffer.totalUnderruns = 10;

    resetAudioStateBuffer();

    expect(audioStateBuffer.processLoadPercent).toBe(0);
    expect(audioStateBuffer.totalUnderruns).toBe(0);
  });
});
