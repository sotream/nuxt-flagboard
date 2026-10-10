import type { Request } from 'express';

/** The part of an Express route layer we read; Express does not export a type for its router internals. */
interface RouteLayer {
  route?: { methods: Record<string, boolean> };
  match(path: string): boolean;
}

const CATCH_ALL_METHODS = 15;

/**
 * The methods the app answers on the path of `request`, upper-case and sorted, for the `Allow` header of a 405 (RFC 9110
 * §15.5.6). Empty when nothing is registered for the path, which is then a plain 404. `HEAD` is added whenever `GET` is
 * there, because Express answers it.
 */
export function allowedMethods(request: Request): string[] {
  const stack =
    (request.app as unknown as { router?: { stack?: RouteLayer[] } }).router?.stack ?? [];
  const methods = new Set<string>();
  for (const layer of stack) {
    if (!layer.route || !layer.match(request.path)) continue;
    const enabled = Object.entries(layer.route.methods).filter(([, on]) => on);
    // Nest registers one catch-all route (every method) to answer unknown paths; it says nothing about this path.
    if (enabled.length >= CATCH_ALL_METHODS) continue;
    for (const [method] of enabled) methods.add(method.toUpperCase());
  }
  if (methods.has('GET')) methods.add('HEAD');
  return [...methods].sort();
}
