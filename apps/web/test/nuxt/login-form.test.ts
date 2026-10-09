import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import LoginForm from '../../app/components/LoginForm.vue';

const mountForm = (props: { pending?: boolean; error?: string } = {}) =>
  mountSuspended(LoginForm, { props: { pending: false, ...props }, attachTo: document.body });

describe('LoginForm', () => {
  it('has labelled fields with the right autocomplete hints', async () => {
    const wrapper = await mountForm();

    const email = wrapper.get('#login-email');
    const password = wrapper.get('#login-password');
    expect(wrapper.get('label[for="login-email"]').text()).toBe('Email');
    expect(wrapper.get('label[for="login-password"]').text()).toBe('Password');
    expect(email.attributes('autocomplete')).toBe('username');
    expect(email.attributes('type')).toBe('email');
    expect(password.attributes('autocomplete')).toBe('current-password');
    expect(password.attributes('type')).toBe('password');
  });

  it('emits the trimmed email and the password as typed', async () => {
    const wrapper = await mountForm();

    await wrapper.get('#login-email').setValue('  admin@example.com ');
    await wrapper.get('#login-password').setValue(' keep my spaces ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([
      [{ email: 'admin@example.com', password: ' keep my spaces ' }],
    ]);
  });

  it('does not submit empty fields, and tells the user which field is wrong', async () => {
    const wrapper = await mountForm();

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    const email = wrapper.get('#login-email');
    expect(email.attributes('aria-invalid')).toBe('true');
    const errorId = email.attributes('aria-describedby')!;
    expect(wrapper.get(`#${errorId}`).text()).toBe('Enter your email address.');
    expect(wrapper.get('#login-password').attributes('aria-invalid')).toBe('true');
  });

  it('moves focus to the first field that needs attention', async () => {
    const wrapper = await mountForm();
    await wrapper.get('form').trigger('submit');
    expect(document.activeElement).toBe(wrapper.get('#login-email').element);

    await wrapper.get('#login-email').setValue('admin@example.com');
    await wrapper.get('form').trigger('submit');
    expect(document.activeElement).toBe(wrapper.get('#login-password').element);
    expect(wrapper.get('#login-email').attributes('aria-invalid')).toBeUndefined();
  });

  it('announces a server error as an alert', async () => {
    const wrapper = await mountForm({ error: 'Wrong email or password.' });
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toBe('Wrong email or password.');
  });

  it('disables the button while signing in, so a second click cannot send a second request', async () => {
    const idle = await mountForm();
    expect(idle.get('button[type="submit"]').attributes('disabled')).toBeUndefined();

    const busy = await mountForm({ pending: true });
    const button = busy.get('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.text()).toBe('Signing in…');
  });
});
