import { Label as RadixLabel } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';
import { forwardRef } from 'react';

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
