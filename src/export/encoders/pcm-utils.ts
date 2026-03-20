/**
 * PCM audio conversion utilities shared across encoder adapters.
 */

/** De-interleave interleaved int16 PCM into per-channel Float32Arrays (-1.0..1.0). */
export function deinterleaveToChannels(
  samples: Int16Array,
  channels: number,
): Float32Array[] {
  const samplesPerChannel = samples.length / channels;
  const channelBuffers: Float32Array[] = [];

  for (let ch = 0; ch < channels; ch++) {
    channelBuffers.push(new Float32Array(samplesPerChannel));
  }

  for (let i = 0; i < samplesPerChannel; i++) {
    for (let ch = 0; ch < channels; ch++) {
      channelBuffers[ch][i] = samples[i * channels + ch] / 32768;
    }
  }

  return channelBuffers;
}
