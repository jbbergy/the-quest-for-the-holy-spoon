import type { Messages } from '../schema'
import type { account as fr } from '../fr/account'

export const account: Messages<typeof fr> = {
  form: {
    email: 'Email address',
    password: 'Password',
    newPassword: 'New password',
    passwordHint: 'At least {min} characters. The easiest way: a short phrase of a few words.',
    emailInvalid: 'This email address is not correct. For example: camille{\'@\'}example.com',
    passwordTooShort: 'This password is too short. It needs at least {min} characters.',
    continueWithout: 'Continue without an account',
    backToSignIn: 'Back to sign in',
  },
  signIn: {
    title: 'Sign in',
    submit: 'Sign in',
    forgot: 'Forgot your password?',
    create: 'Create an account',
  },
  signUp: {
    title: 'Create an account',
    intro:
      'With an account, you find your meals on your other devices. You can also join a household.',
    submit: 'Create my account',
    sentTitle: 'Check your email',
    sent: 'We have just sent a link to {email}. Open it to confirm your address. It works for 24 hours. Also check your spam folder.',
    existing: 'Does this address already have an account? Then you will receive an email to sign in.',
    devNote: 'In development, no email is sent: the link is shown in the server terminal.',
    changeAddress: 'Change address',
    haveAccount: 'I already have an account',
  },
  forgot: {
    title: 'Forgot password',
    intro: 'Write your email address. You will receive a link to choose a new password.',
    submit: 'Get the link',
    sent: 'If an account exists with the address {email}, we have just sent a link to it. It works for 1 hour. Also check your spam folder.',
  },
  reset: {
    title: 'New password',
    incomplete:
      'This link does not work: it is incomplete. Open it directly from the email, or ask for a new link.',
    submit: 'Save and sign me in',
    askNewLink: 'Ask for a new link',
  },
  verify: {
    title: 'Address confirmation',
    pending: 'Confirming…',
    missing:
      'This link does not work: it is incomplete. Open it directly from the email, without copying it.',
    done: 'Your address is confirmed. You are signed in as {email}.',
    createProfile: 'Create my profile',
    continue: 'Continue',
    failedHelp:
      'Sign in with your address and password: if the address is still not confirmed, a new link will be sent to you.',
    signIn: 'Sign in',
  },
}
