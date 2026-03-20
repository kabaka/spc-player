import { forwardRef } from 'react';
import { Slider as RadixSlider } from 'radix-ui';

import styles from './Slider.module.css';

interface SliderProps {
  className?: string;
  value: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-valuetext'?: string;
}

export const Slider = forwardRef<HTMLSpanElement, SliderProps>(
  (
    {
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-valuetext': ariaValueText,
      ...rootProps
    },
    ref,
  ) => (
    <RadixSlider.Root
      ref={ref}
      className={[styles.root, className].filter(Boolean).join(' ')}
      {...rootProps}
    >
      <RadixSlider.Track className={styles.track}>
        <RadixSlider.Range className={styles.range} />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        className={styles.thumb}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-valuetext={ariaValueText}
      />
    </RadixSlider.Root>
  ),
);
Slider.displayName = 'Slider';
