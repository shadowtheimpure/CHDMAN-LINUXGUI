import type { SVGProps } from 'react';

export type IconName =
  | 'search'
  | 'shield'
  | 'disc'
  | 'dvd'
  | 'hdd'
  | 'archive'
  | 'film'
  | 'download'
  | 'copy'
  | 'tag-plus'
  | 'tag-minus'
  | 'tag-down'
  | 'list'
  | 'settings'
  | 'play'
  | 'plus'
  | 'x'
  | 'folder'
  | 'terminal'
  | 'trash'
  | 'retry'
  | 'alert'
  | 'check'
  | 'clock'
  | 'chevron'
  | 'link'
  | 'save'
  | 'queue'
  | 'flame'
  | 'info'
  | 'home'
  | 'file'
  | 'arrow-right';

const PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  disc: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3a9 9 0 0 1 8.5 6" />
    </>
  ),
  dvd: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3.4" />
    </>
  ),
  hdd: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 13h18" />
      <path d="M7 16.5h.01M11 16.5h.01" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 19h16" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  'tag-plus': (
    <>
      <path d="M20 12.5 12.5 20a2 2 0 0 1-2.8 0L4 14.3a2 2 0 0 1-.6-1.4V5a1 1 0 0 1 1-1h7.9a2 2 0 0 1 1.4.6L20 11a1 1 0 0 1 0 1.5Z" />
      <path d="M8.5 8.5h.01" />
      <path d="M15 10v5M12.5 12.5h5" />
    </>
  ),
  'tag-minus': (
    <>
      <path d="M20 12.5 12.5 20a2 2 0 0 1-2.8 0L4 14.3a2 2 0 0 1-.6-1.4V5a1 1 0 0 1 1-1h7.9a2 2 0 0 1 1.4.6L20 11a1 1 0 0 1 0 1.5Z" />
      <path d="M8.5 8.5h.01" />
      <path d="M12.5 12.5h5" />
    </>
  ),
  'tag-down': (
    <>
      <path d="M20 12.5 12.5 20a2 2 0 0 1-2.8 0L4 14.3a2 2 0 0 1-.6-1.4V5a1 1 0 0 1 1-1h7.9a2 2 0 0 1 1.4.6L20 11a1 1 0 0 1 0 1.5Z" />
      <path d="M8.5 8.5h.01" />
      <path d="M14.5 9.5v5m-2.5-2.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  retry: (
    <>
      <path d="M4 12a8 8 0 1 0 2.3-5.7" />
      <path d="M4 4v4h4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  link: (
    <>
      <path d="M10 13a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 4.3l-1.4 1.4" />
      <path d="M14 11a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 19.7l1.4-1.4" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h11l3 3v13H5V4Z" />
      <path d="M8 4v6h7V4M8 20v-6h8v6" />
    </>
  ),
  queue: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 9 12 6 12 3Z" />
      <path d="M9 15a3 3 0 0 0 6 0" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  home: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4" />
    </>
  ),
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
