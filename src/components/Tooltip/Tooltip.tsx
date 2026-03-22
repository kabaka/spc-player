import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';
import { forwardRef } from 'react';

import styles from './Tooltip.module.css';

export const Provider = RadixTooltip.Provider;
export const Root = RadixTooltip.Root;
export const Trigger = RadixTooltip.Trigger;

export const Content = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(({ className, sideOffset = 4, children, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={[styles.content, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
      <Arrow />
    </RadixTooltip.Content>
  </RadixTooltip.Portal>
));
Content.displayName = 'TooltipContent';

export const Arrow = forwardRef<
  SVGSVGElement,
  ComponentPropsWithoutRef<typeof RadixTooltip.Arrow>
>(({ className, ...props }, ref) => (
  <RadixTooltip.Arrow
    ref={ref}
    className={[styles.arrow, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Arrow.displayName = 'TooltipArrow';
