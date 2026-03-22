import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HelpDialog } from './HelpDialog';

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('@/utils/platform', () => ({
  isMacPlatform: vi.fn(() => false),
}));

// Provide __APP_VERSION__ global
vi.stubGlobal('__APP_VERSION__', '2026.03.22');

// ── Helpers ──────────────────────────────────────────────────────────

function renderDialog(open = true) {
  const onOpenChange = vi.fn();
  const result = render(<HelpDialog open={open} onOpenChange={onOpenChange} />);
  return { ...result, onOpenChange };
}

function clickTab(name: string) {
  const tab = screen.getByRole('tab', { name });
  // Radix Tabs uses onMouseDown for activation
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('HelpDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    renderDialog(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens and shows tabs', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(
      screen.getByRole('tablist', { name: 'Help sections' }),
    ).toBeInTheDocument();
  });

  it('defaults to Getting Started tab', () => {
    renderDialog();
    expect(screen.getByText('Quick Start')).toBeInTheDocument();
    expect(screen.getByText(/What is an SPC file/)).toBeInTheDocument();
  });

  it('shows all tab triggers', () => {
    renderDialog();
    const expectedTabs = [
      'Getting Started',
      'Playback',
      'Shortcuts',
      'Playlist',
      'Mixer',
      'Export',
      'Instrument',
      'Analysis',
      'Settings',
      'Troubleshooting',
      'About',
    ];
    for (const label of expectedTabs) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  describe('tab navigation', () => {
    it('switches to Playback tab', () => {
      renderDialog();
      clickTab('Playback');
      expect(screen.getByText('Transport Controls')).toBeInTheDocument();
    });

    it('switches to Shortcuts tab and shows live keymap data', () => {
      renderDialog();
      clickTab('Shortcuts');
      expect(screen.getByText('Player')).toBeInTheDocument();
      expect(screen.getByText('Play / Pause')).toBeInTheDocument();
      // Space key should be rendered as a <kbd> element for play/pause
      const kbdElements = screen.getAllByText('Space');
      expect(kbdElements.length).toBeGreaterThan(0);
    });

    it('switches to Playlist tab', () => {
      renderDialog();
      clickTab('Playlist');
      expect(screen.getByText('Adding Files')).toBeInTheDocument();
      expect(screen.getByText('Shuffle & Repeat')).toBeInTheDocument();
    });

    it('switches to Mixer tab', () => {
      renderDialog();
      clickTab('Mixer');
      expect(screen.getByText('Voice Controls')).toBeInTheDocument();
      expect(
        screen.getByText('What the 8 Voices Represent'),
      ).toBeInTheDocument();
    });

    it('switches to Export tab', () => {
      renderDialog();
      clickTab('Export');
      expect(screen.getByText('Format Comparison')).toBeInTheDocument();
      expect(screen.getByText('WAV')).toBeInTheDocument();
      expect(screen.getByText('FLAC')).toBeInTheDocument();
      expect(screen.getByText('Opus')).toBeInTheDocument();
      expect(screen.getByText('MP3')).toBeInTheDocument();
    });

    it('switches to Instrument tab', () => {
      renderDialog();
      clickTab('Instrument');
      expect(screen.getByText('Keyboard Piano')).toBeInTheDocument();
      expect(screen.getByText('MIDI Device Connection')).toBeInTheDocument();
    });

    it('switches to Analysis tab with glossary', () => {
      renderDialog();
      clickTab('Analysis');
      expect(screen.getByText('Analysis Tabs')).toBeInTheDocument();
      expect(screen.getByText('SNES Audio Glossary')).toBeInTheDocument();
      expect(screen.getByText('SPC700')).toBeInTheDocument();
      expect(screen.getByText('S-DSP')).toBeInTheDocument();
      expect(screen.getByText('BRR')).toBeInTheDocument();
      expect(screen.getByText('ADSR')).toBeInTheDocument();
    });

    it('switches to Settings tab', () => {
      renderDialog();
      clickTab('Settings');
      expect(screen.getByText('Theme')).toBeInTheDocument();
      expect(screen.getByText('Audio Quality')).toBeInTheDocument();
      expect(screen.getByText('Keyboard Remapping')).toBeInTheDocument();
    });

    it('switches to Troubleshooting tab', () => {
      renderDialog();
      clickTab('Troubleshooting');
      expect(
        screen.getByText('No sound after pressing play'),
      ).toBeInTheDocument();
      expect(screen.getByText('Seeking is slow')).toBeInTheDocument();
      expect(
        screen.getByText("MIDI keyboard doesn't work"),
      ).toBeInTheDocument();
      expect(screen.getByText('Speed change shifts pitch')).toBeInTheDocument();
    });

    it('switches to About tab', () => {
      renderDialog();
      clickTab('About');
      const versionEl = screen.getByTestId('help-version');
      expect(versionEl).toHaveTextContent('Version: 2026.03.22');
      expect(
        screen.getByText('MIT License', { exact: false }),
      ).toBeInTheDocument();
    });
  });

  describe('keyboard shortcuts tab', () => {
    it('renders shortcut categories from defaultKeymap', () => {
      renderDialog();
      clickTab('Shortcuts');
      expect(screen.getByText('Navigation')).toBeInTheDocument();
      expect(screen.getByText('A-B Loop')).toBeInTheDocument();
      expect(screen.getByText('General')).toBeInTheDocument();
    });

    it('displays platform-aware keys (non-Mac shows Ctrl)', () => {
      renderDialog();
      clickTab('Shortcuts');
      const ctrlKeys = screen.getAllByText('Ctrl');
      expect(ctrlKeys.length).toBeGreaterThan(0);
    });
  });

  describe('platform-aware keys (Mac)', () => {
    it('renders shortcuts tab on Mac', async () => {
      const { isMacPlatform } = await import('@/utils/platform');
      vi.mocked(isMacPlatform).mockReturnValue(true);

      renderDialog();
      clickTab('Shortcuts');
      expect(screen.getByText('Play / Pause')).toBeInTheDocument();
    });
  });

  describe('about section', () => {
    it('shows version from __APP_VERSION__', () => {
      renderDialog();
      clickTab('About');
      expect(screen.getByTestId('help-version')).toHaveTextContent(
        '2026.03.22',
      );
    });

    it('contains GitHub link', () => {
      renderDialog();
      clickTab('About');
      expect(
        screen.getByRole('link', { name: 'GitHub Repository' }),
      ).toHaveAttribute('href', 'https://github.com/kyleknighted/spc-player');
    });

    it('contains third-party credits link', () => {
      renderDialog();
      clickTab('About');
      expect(
        screen.getByRole('link', { name: 'Third-Party Credits' }),
      ).toBeInTheDocument();
    });
  });

  describe('getting started', () => {
    it("contains link to Zophar's Domain", () => {
      renderDialog();
      const link = screen.getByRole('link', { name: /Zophar/ });
      expect(link).toHaveAttribute(
        'href',
        'https://www.zophar.net/music/nintendo-snes-spc',
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });
});
