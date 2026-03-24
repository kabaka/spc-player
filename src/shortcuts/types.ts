export type ShortcutScope = 'global' | 'contextual' | 'instrument';

export type ShortcutActionId =
  | 'playback.playPause'
  | 'playback.stop'
  | 'playback.nextTrack'
  | 'playback.previousTrack'
  | 'playback.seekForward'
  | 'playback.seekBackward'
  | 'playback.seekForwardLarge'
  | 'playback.seekBackwardLarge'
  | 'playback.volumeUp'
  | 'playback.volumeDown'
  | 'playback.mute'
  | 'playback.speedIncrease'
  | 'playback.speedDecrease'
  | 'playback.speedReset'
  | 'playback.toggleRepeat'
  | 'playback.toggleShuffle'
  | 'loop.setStart'
  | 'loop.setEnd'
  | 'loop.toggle'
  | 'loop.clear'
  | 'navigation.player'
  | 'navigation.playlist'
  | 'navigation.instrument'
  | 'navigation.analysis'
  | 'navigation.settings'
  | 'navigation.search'
  | 'navigation.showHelp'
  | 'playlist.addFiles'
  | 'playlist.removeTrack'
  | 'playlist.moveUp'
  | 'playlist.moveDown'
  | 'playlist.selectAll'
  | 'playlist.deselectAll'
  | 'playlist.playSelected'
  | 'mixer.toggleVoice1'
  | 'mixer.toggleVoice2'
  | 'mixer.toggleVoice3'
  | 'mixer.toggleVoice4'
  | 'mixer.toggleVoice5'
  | 'mixer.toggleVoice6'
  | 'mixer.toggleVoice7'
  | 'mixer.toggleVoice8'
  | 'mixer.soloVoice1'
  | 'mixer.soloVoice2'
  | 'mixer.soloVoice3'
  | 'mixer.soloVoice4'
  | 'mixer.soloVoice5'
  | 'mixer.soloVoice6'
  | 'mixer.soloVoice7'
  | 'mixer.soloVoice8'
  | 'mixer.unmuteAll'
  | 'export.openDialog'
  | 'export.quickExport'
  | 'general.openFile'
  | 'general.undo'
  | 'general.redo'
  | 'general.toggleFullscreen'
  | 'general.closeDialog'
  | 'general.toggleInstrumentMode'
  | 'analysis.memoryTab'
  | 'analysis.registersTab'
  | 'analysis.voicesTab'
  | 'analysis.echoTab'
  | 'analysis.toggleHexDecimal'
  | 'instrument.toggleKeyboard'
  | 'instrument.previousSample'
  | 'instrument.nextSample';

export interface ShortcutOptions {
  scope: ShortcutScope;
  preventDefault?: boolean;
  allowRepeat?: boolean;
}

export interface ShortcutBinding {
  actionId: ShortcutActionId;
  keys: string[];
  scope: ShortcutScope;
}

export interface ShortcutRegistration {
  actionId: ShortcutActionId;
  handler: (event: KeyboardEvent) => void;
  options: ShortcutOptions;
}
