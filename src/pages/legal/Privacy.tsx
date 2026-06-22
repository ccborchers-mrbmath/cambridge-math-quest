import LegalLayout from "./LegalLayout";
import { LEGAL } from "./legalConfig";

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Notice" updated="22 June 2026">
      <p>
        {LEGAL.businessName} ("we") is the data controller for personal data processed
        through {LEGAL.tradingName}. Contact:{" "}
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>

      <h2 className="font-serif text-xl mt-6">1. Data we collect</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Identity & contact:</strong> name and email from your Google account.</li>
        <li><strong>Usage:</strong> questions you view, AI marking attempts, saved progress.</li>
        <li><strong>Payment:</strong> handled by Paddle; we receive subscription status and
          transaction IDs but never your card number.</li>
        <li><strong>Technical:</strong> standard log data such as IP address and browser.</li>
      </ul>

      <h2 className="font-serif text-xl mt-6">2. Why we use it</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>To run your account and let you sign in (legitimate interest).</li>
        <li>To process payments and prevent fraud (contract / legitimate interest).</li>
        <li>To generate AI marking and progress insights (performance of contract).</li>
        <li>To improve and secure the service (legitimate interest).</li>
      </ul>

      <h2 className="font-serif text-xl mt-6">3. Who we share it with</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          <strong>Paddle.com Market Limited</strong> — Merchant of Record for billing,
          tax and fraud screening. Paddle is an independent data controller for payment
          data. See <a className="underline" href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer">Paddle's privacy policy</a>.
        </li>
        <li><strong>Supabase</strong> — hosting and database (sub-processor).</li>
        <li><strong>Google</strong> — OAuth sign-in.</li>
        <li><strong>AI providers</strong> via the Lovable AI Gateway — to generate hints
          and marking feedback. Your handwritten work images are sent to the model for
          marking.</li>
      </ul>

      <h2 className="font-serif text-xl mt-6">4. Retention</h2>
      <p>
        We keep account and progress data while your account exists. You may delete your
        account at any time by emailing us; we will remove personal data within 30 days
        except where retention is required for tax or fraud purposes.
      </p>

      <h2 className="font-serif text-xl mt-6">5. Your rights</h2>
      <p>
        You can request access, correction, deletion or export of your data, or object to
        processing. Email{" "}
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>

      <h2 className="font-serif text-xl mt-6">6. International transfers</h2>
      <p>
        Our processors operate globally. Where data is transferred outside your country,
        appropriate safeguards (such as Standard Contractual Clauses) are in place.
      </p>

      <h2 className="font-serif text-xl mt-6">7. Cookies</h2>
      <p>
        We use only strictly-necessary cookies for authentication and session management.
        We do not use advertising or cross-site tracking cookies.
      </p>
    </LegalLayout>
  );
}