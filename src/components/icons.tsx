// Small inline icon set (stroke icons, 24px grid) so the app has no icon dependency.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Base({ children, ...p }: P) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Base>
);
export const IconChat = (p: P) => (
  <Base {...p}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" />
  </Base>
);
export const IconImage = (p: P) => (
  <Base {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </Base>
);
export const IconMic = (p: P) => (
  <Base {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 17v5" />
  </Base>
);
export const IconMicOff = (p: P) => (
  <Base {...p}>
    <path d="m2 2 20 20" />
    <path d="M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.7-1.3" />
    <path d="M19 10a7 7 0 0 1-1.2 3.9M5 10a7 7 0 0 0 11 5.7" />
    <path d="M12 17v5" />
  </Base>
);
export const IconPhoneOff = (p: P) => (
  <Base {...p}>
    <path d="M10.7 13.3a16 16 0 0 0 3 2.3l1.8-1.8a1.5 1.5 0 0 1 1.6-.3c1 .4 2 .6 3.1.7a1.5 1.5 0 0 1 1.3 1.5v3a1.5 1.5 0 0 1-1.6 1.5A19 19 0 0 1 2.8 4.1 1.5 1.5 0 0 1 4.3 2.5h3a1.5 1.5 0 0 1 1.5 1.3c.1 1.1.3 2.1.7 3.1a1.5 1.5 0 0 1-.3 1.6L7.4 10.3" />
    <path d="m22 2-20 20" />
  </Base>
);
export const IconSend = (p: P) => (
  <Base {...p}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </Base>
);
export const IconStop = (p: P) => (
  <Base {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </Base>
);
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Base>
);
export const IconCopy = (p: P) => (
  <Base {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Base>
);
export const IconSpeaker = (p: P) => (
  <Base {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </Base>
);
export const IconDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Base>
);
export const IconSparkle = (p: P) => (
  <Base {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </Base>
);
export const IconMenu = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);
export const IconX = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);
export const IconBrain = (p: P) => (
  <Base {...p}>
    <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1Z" />
    <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />
  </Base>
);
export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 0 0-14.9-3.5L4 9M4 4v5h5" />
    <path d="M4 13a8 8 0 0 0 14.9 3.5L20 15M20 20v-5h-5" />
  </Base>
);
