import { Dialog as RadixDialog } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';
import { forwardRef } from 'react';

import styles from './Dialog.module.css';

export const Root = RadixDialog.Root;
export const Trigger = RadixDialog.Trigger;
export const Portal = RadixDialog.Portal;

export const Overlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixDialog.Overlay
    ref={ref}
    className={[styles.overlay, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Overlay.displayName = 'DialogOverlay';

export const Content = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixDialog.Content>
>(({ className, children, ...props }, ref) => (
  <Portal>
    <Overlay />
    <RadixDialog.Content
      ref={ref}
      className={[styles.content, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </RadixDialog.Content>
  </Portal>
));
Content.displayName = 'DialogContent';

export const Title = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={[styles.title, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Title.displayName = 'DialogTitle';

export const Description = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={[styles.description, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Description.displayName = 'DialogDescription';

export const Close = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RadixDialog.Close>
>(({ className, children, ...props }, ref) => (
  <RadixDialog.Close
    ref={ref}
    className={[styles.close, className].filter(Boolean).join(' ')}
    aria-label="Close"
    {...props}
  >
    {children ?? '✕'}
  </RadixDialog.Close>
));
Close.displayName = 'DialogClose';
