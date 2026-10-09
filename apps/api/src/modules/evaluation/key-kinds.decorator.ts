import { SetMetadata } from '@nestjs/common';
import type { ApiKeyKind } from '../api-keys/api-key.js';

export const KEY_KINDS_KEY = 'keyKinds';

/** The API key kinds allowed on a route. A route without it accepts no key kind (and so no one). */
export const KeyKinds = (...kinds: ApiKeyKind[]): MethodDecorator & ClassDecorator =>
  SetMetadata(KEY_KINDS_KEY, kinds);
