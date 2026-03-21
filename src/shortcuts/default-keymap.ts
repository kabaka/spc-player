import type { ShortcutActionId, ShortcutBinding } from './types';

function binding(
  actionId: ShortcutActionId,
  keys: string[],
  scope: 'global' | 'contextual',
): [ShortcutActionId, ShortcutBinding] {
  return [actionId, { actionId, keys, scope }];
}

export const defaultKeymap: ReadonlyMap<ShortcutActionId, ShortcutBinding> =
  new Map<ShortcutActionId, ShortcutBinding>([
    // §2.2 Player Controls
    binding('playback.playPause', ['Space'], 'global'),
    binding('playback.stop', ['Ctrl+Space'], 'global'),
    binding('playback.nextTrack', ['Ctrl+ArrowRight'], 'global'),
    binding('playback.previousTrack', ['Ctrl+ArrowLeft'], 'global'),
    binding('playback.seekForward', ['ArrowRight'], 'global'),
    binding('playback.seekBackward', ['ArrowLeft'], 'global'),
    binding('playback.seekForwardLarge', ['Shift+ArrowRight'], 'global'),
    binding('playback.seekBackwardLarge', ['Shift+ArrowLeft'], 'global'),
    binding('playback.volumeUp', ['ArrowUp'], 'global'),
    binding('playback.volumeDown', ['ArrowDown'], 'global'),
    binding('playback.mute', ['KeyM'], 'global'),
    binding('playback.speedIncrease', ['Shift+ArrowUp'], 'global'),
    binding('playback.speedDecrease', ['Shift+ArrowDown'], 'global'),
    binding('playback.speedReset', ['Shift+Backspace'], 'global'),
    binding('playback.toggleRepeat', ['KeyR'], 'global'),
    binding('playback.toggleShuffle', ['KeyS'], 'global'),

    // §2.3 A-B Loop
    binding('loop.setStart', ['BracketLeft'], 'global'),
    binding('loop.setEnd', ['BracketRight'], 'global'),
    binding('loop.toggle', ['KeyL'], 'global'),
    binding('loop.clear', ['Shift+KeyL'], 'global'),

    // §2.4 Navigation
    binding('navigation.player', ['Alt+Digit1'], 'global'),
    binding('navigation.playlist', ['Alt+Digit2'], 'global'),
    binding('navigation.instrument', ['Alt+Digit3'], 'global'),
    binding('navigation.analysis', ['Alt+Digit4'], 'global'),
    binding('navigation.settings', ['Alt+Digit5'], 'global'),
    binding('navigation.search', ['Ctrl+KeyF'], 'global'),
    binding('navigation.showHelp', ['Shift+Slash'], 'global'),

    // §2.5 Playlist Actions
    binding('playlist.addFiles', ['Ctrl+KeyO'], 'contextual'),
    binding('playlist.removeTrack', ['Delete', 'Backspace'], 'contextual'),
    binding('playlist.moveUp', ['Alt+ArrowUp'], 'contextual'),
    binding('playlist.moveDown', ['Alt+ArrowDown'], 'contextual'),
    binding('playlist.selectAll', ['Ctrl+KeyA'], 'contextual'),
    binding('playlist.deselectAll', ['Ctrl+Shift+KeyA'], 'contextual'),
    binding('playlist.playSelected', ['Enter'], 'contextual'),

    // §2.6 Mixer / Voice Controls
    binding('mixer.toggleVoice1', ['Digit1'], 'global'),
    binding('mixer.toggleVoice2', ['Digit2'], 'global'),
    binding('mixer.toggleVoice3', ['Digit3'], 'global'),
    binding('mixer.toggleVoice4', ['Digit4'], 'global'),
    binding('mixer.toggleVoice5', ['Digit5'], 'global'),
    binding('mixer.toggleVoice6', ['Digit6'], 'global'),
    binding('mixer.toggleVoice7', ['Digit7'], 'global'),
    binding('mixer.toggleVoice8', ['Digit8'], 'global'),
    binding('mixer.soloVoice1', ['Shift+Digit1'], 'global'),
    binding('mixer.soloVoice2', ['Shift+Digit2'], 'global'),
    binding('mixer.soloVoice3', ['Shift+Digit3'], 'global'),
    binding('mixer.soloVoice4', ['Shift+Digit4'], 'global'),
    binding('mixer.soloVoice5', ['Shift+Digit5'], 'global'),
    binding('mixer.soloVoice6', ['Shift+Digit6'], 'global'),
    binding('mixer.soloVoice7', ['Shift+Digit7'], 'global'),
    binding('mixer.soloVoice8', ['Shift+Digit8'], 'global'),
    binding('mixer.unmuteAll', ['Digit0'], 'global'),

    // §2.8 Export
    binding('export.openDialog', ['Ctrl+KeyE'], 'global'),
    binding('export.quickExport', ['Ctrl+Shift+KeyE'], 'global'),

    // §2.9 General
    binding('general.openFile', ['Ctrl+KeyO'], 'global'),
    binding('general.undo', ['Ctrl+KeyZ'], 'global'),
    binding('general.redo', ['Ctrl+Shift+KeyZ'], 'global'),
    binding('general.toggleFullscreen', ['KeyF'], 'global'),
    binding('general.closeDialog', ['Escape'], 'global'),
    binding('general.toggleInstrumentMode', ['Backquote'], 'global'),
    binding('instrument.toggleKeyboard', ['Backquote'], 'contextual'),

    // §2.7 Analysis / Inspector
    binding('analysis.memoryTab', ['Alt+KeyM'], 'contextual'),
    binding('analysis.registersTab', ['Alt+KeyR'], 'contextual'),
    binding('analysis.voicesTab', ['Alt+KeyV'], 'contextual'),
    binding('analysis.echoTab', ['Alt+KeyE'], 'contextual'),
    binding('analysis.toggleHexDecimal', ['KeyH'], 'contextual'),
  ]);
