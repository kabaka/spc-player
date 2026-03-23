import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const iconDefaults: IconProps = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
  focusable: 'false',
};

export function PlayIcon(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="5" y="4" width="4" height="16" />
      <rect x="15" y="4" width="4" height="16" />
    </svg>
  );
}

export function PreviousTrackIcon(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <rect x="4" y="4" width="3" height="16" />
      <polygon points="20,4 9,12 20,20" />
    </svg>
  );
}

export function NextTrackIcon(props: IconProps) {
  return (
    <svg {...iconDefaults} {...props}>
      <polygon points="4,4 15,12 4,20" />
      <rect x="17" y="4" width="3" height="16" />
    </svg>
  );
}

export function VolumeHighIcon(props: IconProps) {
  return (
    <svg
      {...iconDefaults}
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 010 7.07" strokeLinecap="round" />
      <path d="M18.36 5.64a9 9 0 010 12.73" strokeLinecap="round" />
    </svg>
  );
}

export function VolumeMuteIcon(props: IconProps) {
  return (
    <svg
      {...iconDefaults}
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
      <line x1="16" y1="9" x2="22" y2="15" strokeLinecap="round" />
      <line x1="22" y1="9" x2="16" y2="15" strokeLinecap="round" />
    </svg>
  );
}

export function GamepadIcon(props: IconProps) {
  return (
    <svg
      {...iconDefaults}
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M6 11h12a4 4 0 01-1.5 7H7.5A4 4 0 016 11z"
        fill="currentColor"
        stroke="none"
      />
      <rect x="4" y="8" width="16" height="8" rx="4" />
      <line x1="8" y1="10" x2="8" y2="14" strokeLinecap="round" />
      <line x1="6" y1="12" x2="10" y2="12" strokeLinecap="round" />
      <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
