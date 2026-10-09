import { defineNuxtRouteMiddleware, navigateTo } from '#imports';
import { useSession } from '~/composables/useSession';
import { isLoginPath } from '~/utils/safe-redirect';

/**
 * Every page except the sign-in page needs a session. On the first navigation after a page load the session is
 * resumed silently from the refresh cookie, so a reload does not send a signed-in user back to the form.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSession();
  await session.restore();
  const signedIn = session.state.status === 'authenticated';

  // `/login/` is the same page as `/login`. Treating it as another page would send a signed-out visitor to
  // `/login?redirect=/login/` and leave them on the form after signing in.
  if (isLoginPath(to.path)) {
    if (signedIn) return navigateTo('/');
    return to.path === '/login'
      ? undefined
      : navigateTo({ path: '/login', query: to.query }, { replace: true });
  }
  if (!signedIn) {
    return navigateTo({
      path: '/login',
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    });
  }
});
