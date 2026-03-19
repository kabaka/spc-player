/**
 * Type declarations for the AudioWorklet global scope.
 *
 * These globals exist only inside AudioWorklet contexts.
 * TypeScript's default "DOM" lib does not include them.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor
 */

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (
    options?: AudioWorkletNodeOptions,
  ) => AudioWorkletProcessor,
): void;

declare const currentFrame: number;
declare const currentTime: number;
declare const sampleRate: number;
