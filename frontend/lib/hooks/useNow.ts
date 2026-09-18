"use client";

import { useCallback, useEffect, useState } from "react";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  const refresh = useCallback(() => setNow(Math.floor(Date.now() / 1000)), []);
  return { now, refresh };
}
