import { useAppStore } from '@/store/store';
import { isMacPlatform } from '@/utils/platform';

import { defaultKeymap } from './default-keymap';
import type {
  ShortcutActionId,
  ShortcutBinding,
  ShortcutOptions,
  ShortcutRegistration,
} from './types';

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

const RESERVED_COMBOS = new Set([
  'Escape',
  'Tab',
  'Shift+Tab',
  'Ctrl+KeyC',
  'Ctrl+KeyV',
  'Ctrl+KeyX',
  'Ctrl+KeyO',
  'Ctrl+KeyE',
  'F5',
  'F11',
  'F12',
]);

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'email',
  'password',
  'number',
  'tel',
]);

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'SELECT']);

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
]);

const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'radio',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'tab',
  'link',
]);

const INSTRUMENT_MODE_PASSTHROUGH = new Set([
  'Space',
  'Backquote',
  'Ctrl+Space',
  'ArrowLeft',
  'ArrowRight',
  'BracketLeft',
  'BracketRight',
  'ArrowUp',
  'ArrowDown',
  'Escape',
  'Alt+Digit1',
  'Alt+Digit2',
  'Alt+Digit3',
  'Alt+Digit4',
  'Alt+Digit5',
]);

export class ShortcutManager {
  private readonly isMac: boolean;
  private readonly globalHandlers = new Map<
    string,
    Set<ShortcutRegistration>
  >();
  private readonly contextualHandlers = new Map<
    string,
    Set<ShortcutRegistration>
  >();
  private readonly registeredWidgets = new Map<HTMLElement, Set<string>>();
  private keymap: ReadonlyMap<ShortcutActionId, ShortcutBinding>;
  private overlayDepth = 0;
  private isAttached = false;

  constructor(keymap?: ReadonlyMap<ShortcutActionId, ShortcutBinding>) {
    this.isMac = isMacPlatform();
    this.keymap = keymap ?? defaultKeymap;
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  attach(): void {
    if (this.isAttached) return;
    document.addEventListener('keydown', this.handleKeyDown, {
      capture: true,
    });
    this.isAttached = true;
  }

  detach(): void {
    if (!this.isAttached) return;
    document.removeEventListener('keydown', this.handleKeyDown, {
      capture: true,
    });
    this.isAttached = false;
  }

  register(
    actionId: ShortcutActionId,
    handler: (event: KeyboardEvent) => void,
    options: ShortcutOptions,
  ): void {
    const registration: ShortcutRegistration = { actionId, handler, options };
    const binding = this.keymap.get(actionId);
    if (!binding) return;

    const targetMap =
      options.scope === 'contextual'
        ? this.contextualHandlers
        : this.globalHandlers;

    for (const key of binding.keys) {
      let set = targetMap.get(key);
      if (!set) {
        set = new Set();
        targetMap.set(key, set);
      }
      set.add(registration);
    }
  }

  unregister(
    actionId: ShortcutActionId,
    handler: (event: KeyboardEvent) => void,
  ): void {
    for (const map of [this.globalHandlers, this.contextualHandlers]) {
      for (const [, set] of map) {
        for (const reg of set) {
          if (reg.actionId === actionId && reg.handler === handler) {
            set.delete(reg);
          }
        }
      }
    }
  }

  registerWidget(
    id: string,
    element: HTMLElement,
    claimedKeys: Set<string>,
  ): () => void {
    void id;
    this.registeredWidgets.set(element, claimedKeys);
    return () => {
      this.registeredWidgets.delete(element);
    };
  }

  unregisterWidget(element: HTMLElement): void {
    this.registeredWidgets.delete(element);
  }

  pushOverlay(): void {
    this.overlayDepth++;
  }

  popOverlay(): void {
    if (this.overlayDepth > 0) {
      this.overlayDepth--;
    }
  }

  getKeymap(): ReadonlyMap<ShortcutActionId, ShortcutBinding> {
    return this.keymap;
  }

  normalizeCombo(event: KeyboardEvent): string {
    const parts: string[] = [];

    const ctrlPressed = this.isMac ? event.metaKey : event.ctrlKey;
    if (ctrlPressed) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');

    const code = event.code;
    if (!MODIFIER_CODES.has(code)) {
      parts.push(code);
    }

    return parts.join('+');
  }

  resolveKeyEvent(event: KeyboardEvent): void {
    const combo = this.normalizeCombo(event);

    // Empty combo (modifier-only press)
    if (!combo || combo === 'Ctrl' || combo === 'Shift' || combo === 'Alt') {
      return;
    }

    // 1. Text input — suppress everything except Escape/Tab
    // Check activeElement (not event.target) because capture-phase listeners
    // on document see event.target as the dispatching element, not the focused one.
    if (this.isTextInputFocused(document.activeElement)) {
      if (combo !== 'Escape' && combo !== 'Tab') return;
    }

    // 2. Radix overlay — let Radix handle unless reserved global
    if (this.overlayDepth > 0) {
      if (!this.isReservedGlobal(combo)) return;
    }

    // 3. Focused interactive element — yield Space/Enter
    if (this.isFocusedInteractiveElement()) {
      if (combo === 'Space' || combo === 'Enter') return;
    }

    // 4. Focused custom widget — let widget handle claimed keys
    const widgetClaimed = this.isWidgetClaimedKey(combo);
    if (widgetClaimed) {
      return;
    }

    // 5. Instrument mode — suppress non-reserved global shortcuts
    if (this.isInstrumentModeActive()) {
      const instrumentCombo = this.normalizeCombo(event);
      if (
        !this.isReservedGlobal(instrumentCombo) &&
        !INSTRUMENT_MODE_PASSTHROUGH.has(instrumentCombo)
      ) {
        return;
      }
    }

    // 6. Contextual scope
    const contextualResult = this.dispatchFromMap(
      this.contextualHandlers,
      combo,
      event,
    );
    if (contextualResult) return;

    // 7. Global scope
    this.dispatchFromMap(this.globalHandlers, combo, event);
  }

  isTextInputFocused(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT') {
      const type = (target as HTMLInputElement).type;
      return TEXT_INPUT_TYPES.has(type);
    }
    if (tag === 'TEXTAREA') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  isFocusedInteractiveElement(): boolean {
    const el = document.activeElement;
    if (!el || el === document.body) return false;

    const tag = el.tagName;
    if (INTERACTIVE_TAGS.has(tag)) return true;
    if (tag === 'INPUT') {
      const type = (el as HTMLInputElement).type;
      return NON_TEXT_INPUT_TYPES.has(type);
    }

    const role = el.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role)) return true;

    return false;
  }

  private isWidgetClaimedKey(combo: string): boolean {
    const el = document.activeElement;
    if (!el) return false;
    for (const [widget, claimedKeys] of this.registeredWidgets) {
      if (widget.contains(el) && claimedKeys.has(combo)) return true;
    }
    return false;
  }

  private isReservedGlobal(combo: string): boolean {
    return RESERVED_COMBOS.has(combo);
  }

  private isInstrumentModeActive(): boolean {
    return useAppStore.getState().isInstrumentModeActive;
  }

  private dispatchFromMap(
    map: Map<string, Set<ShortcutRegistration>>,
    combo: string,
    event: KeyboardEvent,
  ): boolean {
    const registrations = map.get(combo);
    if (!registrations || registrations.size === 0) return false;

    for (const reg of registrations) {
      if (!reg.options.allowRepeat && event.repeat) continue;
      if (reg.options.preventDefault !== false) {
        event.preventDefault();
      }
      reg.handler(event);
      return true;
    }

    return false;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    this.resolveKeyEvent(event);
  }
}

let shortcutManager: ShortcutManager;
if (import.meta.hot?.data?.shortcutManager) {
  shortcutManager = import.meta.hot.data.shortcutManager;
} else {
  shortcutManager = new ShortcutManager();
}
if (import.meta.hot?.data) {
  import.meta.hot.data.shortcutManager = shortcutManager;
}
export { shortcutManager };
