import { computed } from 'vue';
import { useSession } from './useSession';

/** True for admins. Viewers see the same pages with the controls that change things disabled or hidden. */
export function useIsAdmin() {
  const session = useSession();
  return computed(() => session.state.user?.role === 'admin');
}
