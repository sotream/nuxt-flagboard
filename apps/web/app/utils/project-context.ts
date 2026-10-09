import type { InjectionKey } from 'vue';
import type { useResource } from '~/composables/useResource';
import type { ProjectView } from './api-types';

/** The project of the current route, loaded once by the project page and shared with its sections. */
export const PROJECT_CONTEXT: InjectionKey<ReturnType<typeof useResource<ProjectView>>> =
  Symbol('project');
