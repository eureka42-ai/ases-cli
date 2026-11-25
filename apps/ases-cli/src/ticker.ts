import { useEffect, useState } from 'react';

// AER-REQ-246: animação opcional, desligada em CI, saída redirecionada (a TUI só roda em TTY), TERM=dumb, `--no-animation`
// e movimento reduzido (ASES_REDUCED_MOTION=1). Este é o ÚNICO timer de desenho das TUIs (o teste no-animation confere).

/** Se o relógio de "pensando" pode correr sozinho. */
export function shouldAnimate(o: { noAnimation?: boolean; ci?: boolean }, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return !o.noAnimation && !o.ci && env.TERM !== 'dumb' && !env.ASES_REDUCED_MOTION && !env.CI;
}

/** `Date.now()` que se atualiza a cada segundo enquanto `active` e a animação estiver permitida; senão, só a cada desenho. */
export function useNow(active: boolean, animation: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !animation) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, animation]);
  return active && !animation ? Date.now() : now;
}
