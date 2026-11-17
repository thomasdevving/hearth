import { useEffect, useState } from "react";
import { onChange } from "../app/events";

/** Run an async query now and again after every store change. */
export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const run = () => {
      fn().then((v) => alive && setValue(v)).catch((e) => console.error(e));
    };
    run();
    const off = onChange(run);
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
