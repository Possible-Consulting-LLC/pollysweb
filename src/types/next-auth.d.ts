import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      emailChangeReauthAt?: number;
      credentialVersion?: string;
    } & DefaultSession["user"];
  }
}
