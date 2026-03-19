import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { AlertDialog as RadixAlertDialog } from 'radix-ui';

import styles from './AlertDialog.module.css';

export const Root = RadixAlertDialog.Root;
export const Trigger = RadixAlertDialog.Trigger;
export const Portal = RadixAlertDialog.Portal;

export const Overlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Overlay
    ref={ref}
    className={[styles.overlay, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Overlay.displayName = 'AlertDialogOverlay';

export const Content = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Content>
>(({ className, children, ...props }, ref) => (
  <Portal>
    <Overlay />
    <RadixAlertDialog.Content
      ref={ref}
      className={[styles.content, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </RadixAlertDialog.Content>
  </Portal>
));
Content.displayName = 'AlertDialogContent';

export const Title = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Title
    ref={ref}
    className={[styles.title, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Title.displayName = 'AlertDialogTitle';

export const Description = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Description
    ref={ref}
    className={[styles.description, className].filter(Boolean).join(' ')}
    {...props}
  />
));
Description.displayName = 'AlertDialogDescription';

export const Cancel = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Cancel>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Cancel ref={ref} className={className} {...props} />
));
Cancel.displayName = 'AlertDialogCancel';

export const Action = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Action>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Action ref={ref} className={className} {...props} />
));
Action.displayName = 'AlertDialogAction';
