"use client";

import { useSyncExternalStore } from "react";

/** true/false theo media query; null khi đang render phía server/hydrate. */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}
