import { useCallback } from 'react';
import { Tabs } from 'radix-ui';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { Button } from '@/components/Button/Button';
import { useShortcut } from '@/shortcuts/useShortcut';
import { useAppStore } from '@/store/store';

import { useHexDecimalToggle } from './useHexDecimalToggle';
import { MemoryViewer } from './MemoryViewer';
import { RegisterViewer } from './RegisterViewer';
import { VoiceStatePanel } from './VoiceStatePanel';
import { EchoBufferView } from './EchoBufferView';
import styles from './AnalysisView.module.css';

type AnalysisTab = 'memory' | 'registers' | 'voices' | 'echo';

export function AnalysisView() {
  const { tab } = useSearch({ from: '/analysis' });
  const navigate = useNavigate();
  const metadata = useAppStore((s) => s.metadata);
  const { isHex, toggle, format } = useHexDecimalToggle();

  const setTab = useCallback(
    (value: string) => {
      void navigate({
        to: '/analysis',
        search: (prev) => ({ ...prev, tab: value as AnalysisTab }),
        replace: true,
      });
    },
    [navigate],
  );

  useShortcut('analysis.memoryTab', () => setTab('memory'), {
    scope: 'contextual',
  });
  useShortcut('analysis.registersTab', () => setTab('registers'), {
    scope: 'contextual',
  });
  useShortcut('analysis.voicesTab', () => setTab('voices'), {
    scope: 'contextual',
  });
  useShortcut('analysis.echoTab', () => setTab('echo'), {
    scope: 'contextual',
  });

  if (!metadata) {
    return (
      <main aria-label="Analysis" className={styles.view}>
        <h1 className={styles.visuallyHidden}>Analysis</h1>
        <div className={styles.emptyState}>
          Load an SPC file to view analysis data
        </div>
      </main>
    );
  }

  return (
    <main aria-label="Analysis" className={styles.view}>
      <h1 className={styles.visuallyHidden}>Analysis</h1>

      <Tabs.Root value={tab} onValueChange={setTab}>
        <div className={styles.header}>
          <Tabs.List aria-label="Analysis sections" className={styles.tabList}>
            <Tabs.Trigger value="memory" className={styles.tabTrigger}>
              Memory
            </Tabs.Trigger>
            <Tabs.Trigger value="registers" className={styles.tabTrigger}>
              Registers
            </Tabs.Trigger>
            <Tabs.Trigger value="voices" className={styles.tabTrigger}>
              Voices
            </Tabs.Trigger>
            <Tabs.Trigger value="echo" className={styles.tabTrigger}>
              Echo
            </Tabs.Trigger>
          </Tabs.List>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Display format"
            aria-pressed={isHex}
            onClick={toggle}
            className={styles.hexToggle}
          >
            {isHex ? 'HEX' : 'DEC'}
          </Button>
        </div>

        <Tabs.Content value="memory" className={styles.tabContent}>
          <MemoryViewer isHex={isHex} format={format} />
        </Tabs.Content>
        <Tabs.Content value="registers" className={styles.tabContent}>
          <RegisterViewer isHex={isHex} format={format} />
        </Tabs.Content>
        <Tabs.Content value="voices" className={styles.tabContent}>
          <VoiceStatePanel isHex={isHex} format={format} />
        </Tabs.Content>
        <Tabs.Content value="echo" className={styles.tabContent}>
          <EchoBufferView />
        </Tabs.Content>
      </Tabs.Root>
    </main>
  );
}
