import { defineNuxtRouteMiddleware, navigateTo } from '#imports';
import { useSession } from '~/composables/useSession';

/**
 * Every page except the sign-in page needs a session. On the first navigation after a page load the session is
 * resumed silently from the refresh cookie, so a reload does not send a signed-in user back to the form.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSession();
  await session.restore();
  const signedIn = session.state.status === 'authenticated';

  if (to.path === '/login') {
    return signedIn ? navigateTo('/') : undefined;
  }
  if (!signedIn) {
    return navigateTo({
      path: '/login',
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    });
  }
});
