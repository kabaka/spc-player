import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { ContextMenu as RadixContextMenu } from 'radix-ui';

import styles from './ContextMenu.module.css';

export { styles as contextMenuStyles };

export const Root = RadixContextMenu.Root;
export const Trigger = RadixContextMenu.Trigger;
export const Portal = RadixContextMenu.Portal;
export const Group = RadixContextMenu.Group;
export const Sub = RadixContextMenu.Sub;
export const SubTrigger = RadixContextMenu.SubTrigger;
export const SubContent = RadixContextMenu.SubContent;
export const RadioGroup = RadixContextMenu.RadioGroup;

export const Content = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixContextMenu.Content>
>(({ className, ...props }, ref) => (
  <RadixContextMenu.Portal>
    <RadixContextMenu.Content
      ref={ref}
      className={[styles.content, className].filter(Boolean).join(' ')}
      {...props}
    />
  </RadixContextMenu.Portal>
));
Content.displayName = 'ContextMenuContent';

export const Item = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixContextMenu.Item>
>(({ className, ...props }, ref) => (
  <RadixContextMenu.Item
    ref={ref}
    className={[styles.item, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Item.displayName = 'ContextMenuItem';

export const Separator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixContextMenu.Separator>
>(({ className, ...props }, ref) => (
  <RadixContextMenu.Separator
    ref={ref}
    className={[styles.separator, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Separator.displayName = 'ContextMenuSeparator';

export const Label = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixContextMenu.Label>
>(({ className, ...props }, ref) => (
  <RadixContextMenu.Label
    ref={ref}
    className={[styles.label, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Label.displayName = 'ContextMenuLabel';
