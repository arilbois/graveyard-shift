import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the OS asks for reduced motion. Combined with the user setting by the caller (R12.1). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const list = matchMedia(QUERY);
    const update = (): void => {
      setReduced(list.matches);
    };
    list.addEventListener('change', update);
    return () => {
      list.removeEventListener('change', update);
    };
  }, []);
  return reduced;
}
