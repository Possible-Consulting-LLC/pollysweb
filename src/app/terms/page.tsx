import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms & Conditions | Spoodly Space",
  description: "The basic terms for using Spoodly Space.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms & Conditions"
      intro="These terms set out the basic rules for using Spoodly Space and caring for the information you add."
    >
      <section>
        <h2>Using Spoodly Space</h2>
        <p>By creating an account or using Spoodly Space, you agree to these terms. If you do not agree, please do not use the service. You must be at least 13 years old to create an account. If local law requires a higher age or parental permission, that requirement also applies.</p>
      </section>

      <section>
        <h2>Your account</h2>
        <p>Provide accurate account information and keep your sign-in methods secure. You are responsible for activity under your account. Tell us at <a href="mailto:support@spoodlyspace.com">support@spoodlyspace.com</a> if you believe someone has accessed it without permission.</p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>You keep ownership of the spood profiles, care notes, and photos you add. You give us permission to store, process, and display that content as needed to operate the service. Only upload material you have the right to use. Photos use account-checked private storage; older copies shared before this protection may still exist. See our <Link href="/privacy">Privacy Policy</Link>.</p>
      </section>

      <section>
        <h2>Responsible use</h2>
        <p>Do not use the service to break the law, infringe someone else’s rights, interfere with other accounts, probe or bypass security, upload harmful code, or overload the service. We may limit or suspend access when reasonably needed to protect the service or its users.</p>
      </section>

      <section>
        <h2>Care information</h2>
        <p>Spoodly Space helps you record and organize care. Reminders, status labels, streaks, badges, and other information are tools for your own judgment; they are not veterinary advice or a guarantee of an animal’s health. Seek a qualified professional when your spood needs care beyond your experience.</p>
      </section>

      <section>
        <h2>Paid plans</h2>
        <p>Some features may require a paid Pro subscription. Prices, billing intervals, and renewal details are shown at checkout. Stripe processes payments. You can manage an active subscription through the billing link in Settings. Any cancellation or refund rights required by applicable law still apply.</p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>We may improve, change, or discontinue parts of Spoodly Space. We aim to keep it available, but cannot guarantee uninterrupted access or that every feature will always work exactly as expected. We may update these terms and will post the new version with a revised effective date.</p>
      </section>

      <section>
        <h2>Limits of responsibility</h2>
        <p>To the extent permitted by applicable law, Spoodly Space is provided “as is” and we are not responsible for indirect or consequential losses arising from use of the service. Nothing in these terms limits rights or remedies that cannot legally be limited.</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions about these terms or your account? Email <a href="mailto:support@spoodlyspace.com">support@spoodlyspace.com</a>. Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your information.</p>
      </section>
    </LegalPageShell>
  );
}
