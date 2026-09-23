/** Present only known Auth.js error codes; never echo an untrusted query value. */
export function socialErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case "OAuthAccountNotLinked":
      return "That email already has a keeper account. Sign in with your existing method, then connect this provider in Settings.";
    case "AccessDenied":
      return "We couldn’t use that provider account. Check that it shares a verified email, or sign in with email and password.";
    case "FacebookEmailUnavailable":
      return "Facebook didn’t share an email for this sign-in. Review the email permission in Facebook and try again, or create an account with email and password, then connect Facebook in Settings.";
    case "OAuthCallback":
    case "OAuthCallbackError":
    case "OAuthSignin":
      return "Provider sign-in was cancelled or couldn’t be completed. Please try again.";
    case "Configuration":
      return "This sign-in method is temporarily unavailable. Please use another method or try again later.";
    case "SessionRequired":
      return "Please sign in again before connecting another sign-in method.";
    default:
      return null;
  }
}
