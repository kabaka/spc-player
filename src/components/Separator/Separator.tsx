import { Separator as RadixSeparator } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';
import { forwardRef } from 'react';

import styles from './Separator.module.css';

export const Separator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixSeparator.Root>
>(({ className, ...props }, ref) => (
  <RadixSeparator.Root
    ref={ref}
    className={[styles.separator, className].filter(Boolean).join(' ')}
    {...props}
  />
));

Separator.displayName = 'Separator';
