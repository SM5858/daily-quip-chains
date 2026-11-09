"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "system" | "dark";

const KEY = "theme";

/* ---------------------------------------------------------------------------
   The stored preference, as an external store.

   Which option is active lives in `localStorage`, which the server cannot
   read — so this is React reading a value it does not own, and
   useSyncExternalStore is the hook for exactly that. It renders
   `getServerSnapshot()` during hydration and then reconciles against the real
   client value, instead of the setState-in-an-effect version, which renders
   the wrong answer first and then corrects it.

   Subscribing to `storage` as well means two tabs stay in step.
   --------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private windows and blocked site data both land here; the OS decides.
  }
  return "system";
}

/** No preference is knowable on the server, so the OS default is the honest answer. */
function getServerSnapshot(): Theme {
  return "system";
}

function setTheme(theme: Theme) {
  const root = document.documentElement;

  // "system" is a real third state: removing the attribute hands the decision
  // back to prefers-color-scheme, so the page follows the OS live afterwards.
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;

  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Not persisting is survivable; the page still renders in the chosen mode.
  }

  for (const onChange of listeners) onChange();
}

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="8" r="3.1" fill="currentColor" />
        <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M13 3l-1.1 1.1M4.1 11.9 3 13" />
        </g>
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect
          x="1.6"
          y="2.6"
          width="12.8"
          height="8.8"
          rx="1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M5.5 14h5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M13 10.3A5.6 5.6 0 0 1 5.7 3a5.9 5.9 0 1 0 7.3 7.3Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

/** Light / System / Dark, in the header of every page including the login screen. */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={`${option.label} theme`}
            onClick={() => setTheme(option.value)}
            className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
              active
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
