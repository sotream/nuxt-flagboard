import type { FlagValue, Rule } from '@flagboard/core';
import { ENVIRONMENT_KEYS } from '../projects/entities/environment.entity.js';
import type { EnvironmentKey } from '../projects/entities/environment.entity.js';
import type { FlagEnvironment } from './entities/flag-environment.entity.js';
import type { Flag } from './entities/flag.entity.js';
import { parseFlagValue } from './flag-values.js';
import type { FlagType } from './flag-values.js';

export interface FlagEnvironmentView {
  environment: EnvironmentKey;
  enabled: boolean;
  rolloutPercentage: number;
  rules: Rule[];
  killSwitch: boolean;
  killReason: string | null;
  /** Send this back on the next update; a mismatch means someone else changed it first (409). */
  revision: number;
  updatedAt: Date;
}

/** What the admin API returns for a flag. The salt is deliberately not part of it. */
export interface FlagView {
  key: string;
  name: string;
  description: string;
  type: FlagType;
  onValue: FlagValue;
  offValue: FlagValue;
  clientVisible: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  environments: FlagEnvironmentView[];
}

/** Expects the state's `environment` to be loaded. */
export function toFlagEnvironmentView(state: FlagEnvironment): FlagEnvironmentView {
  return {
    environment: state.environment.key,
    enabled: state.enabled,
    rolloutPercentage: state.rolloutPercentage,
    rules: state.rules,
    killSwitch: state.killSwitch,
    killReason: state.killReason,
    revision: state.revision,
    updatedAt: state.updatedAt,
  };
}

/** Expects `flagEnvironments` loaded with their `environment`. */
export function toFlagView(flag: Flag): FlagView {
  return {
    key: flag.key,
    name: flag.name,
    description: flag.description,
    type: flag.type,
    onValue: parseFlagValue(flag.type, flag.onValue),
    offValue: parseFlagValue(flag.type, flag.offValue),
    clientVisible: flag.clientVisible,
    archivedAt: flag.archivedAt,
    createdAt: flag.createdAt,
    environments: flag.flagEnvironments
      .map(toFlagEnvironmentView)
      .sort(
        (a, b) => ENVIRONMENT_KEYS.indexOf(a.environment) - ENVIRONMENT_KEYS.indexOf(b.environment),
      ),
  };
}
