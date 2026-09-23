export function checkoutReturnNotice(success: boolean, isDemo: boolean, plan: string) {
  if (!success || isDemo) return null;
  return plan === 'pro'
    ? 'Welcome to Pro — you can add as many spoods as you like.'
    : 'Payment received. We’re confirming your Pro access; refresh this page shortly.';
}
