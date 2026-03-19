import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { Label as RadixLabel } from 'radix-ui';

import styles from './Label.module.css';

export const Label = forwardRef<
  HTMLLabelElement,
  ComponentPropsWithoutRef<typeof RadixLabel.Root>
>(({ className, ...props }, ref) => (
  <RadixLabel.Root
    ref={ref}
    className={[styles.label, className].filter(Boolean).join(' ')}
    {...props}
  />
));

Label.displayName = 'Label';
