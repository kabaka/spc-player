import type { MixerSlice, SliceCreator } from '../types';

const VOICE_COUNT = 8;
const falseArray = (): boolean[] =>
  Array.from({ length: VOICE_COUNT }, () => false);

export const createMixerSlice: SliceCreator<MixerSlice> = (set) => ({
  voiceMuted: falseArray(),
  voiceSolo: falseArray(),

  toggleMute: (voiceIndex) => {
    set(
      (state) => {
        const muted = [...state.voiceMuted];
        muted[voiceIndex] = !muted[voiceIndex];
        return { voiceMuted: muted };
      },
      false,
      'mixer/toggleMute',
    );
  },

  toggleSolo: (voiceIndex) => {
    set(
      (state) => {
        const solo = [...state.voiceSolo];
        solo[voiceIndex] = !solo[voiceIndex];
        return { voiceSolo: solo };
      },
      false,
      'mixer/toggleSolo',
    );
  },

  resetMixer: () => {
    set(
      { voiceMuted: falseArray(), voiceSolo: falseArray() },
      false,
      'mixer/resetMixer',
    );
  },
});
