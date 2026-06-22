import LegalLayout from "./LegalLayout";
import { LEGAL } from "./legalConfig";

export default function Terms() {
  return (
    <LegalLayout title="Terms & Conditions" updated="22 June 2026">
      <p>
        These Terms govern your use of {LEGAL.tradingName} ({LEGAL.productSummary}).
        By creating an account or making a purchase you agree to them.
      </p>

      <h2 className="font-serif text-xl mt-6">1. Who we are</h2>
      <p>
        {LEGAL.businessName} is the seller of the service. You can reach us at{" "}
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>

      <h2 className="font-serif text-xl mt-6">2. Merchant of Record</h2>
      <p>
        Payments are processed by <strong>Paddle.com Market Limited</strong>, our Merchant
        of Record. Paddle handles billing, tax, fraud prevention and chargebacks on our
        behalf. Your purchase contract for payment is with Paddle, while your contract for
        access to the service is with {LEGAL.businessName}.
      </p>

      <h2 className="font-serif text-xl mt-6">3. Your account</h2>
      <p>
        You sign in with Google. You are responsible for activity that happens under
        your account. Tell us immediately if you suspect unauthorised access.
      </p>

      <h2 className="font-serif text-xl mt-6">4. What you may and may not do</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>You may use the service for personal Cambridge 9709 study.</li>
        <li>You may not resell access, scrape questions in bulk, or share your account.</li>
        <li>You may not attempt to bypass billing, rate limits, or feature gating.</li>
        <li>You may not upload abusive, illegal, or rights-infringing content.</li>
      </ul>

      <h2 className="font-serif text-xl mt-6">5. Intellectual property</h2>
      <p>
        Cambridge past-paper questions remain the property of Cambridge International. The
        platform, AI feedback, hints and original content are owned by {LEGAL.businessName}
        and licensed to you for personal study only.
      </p>

      <h2 className="font-serif text-xl mt-6">6. Subscriptions and credits</h2>
      <p>
        Math Pro is billed monthly with a 7-day free trial. Each AI marking uses 1 credit.
        Subscription credits reset each billing period; top-up credits roll over while your
        subscription stays active. When a subscription ends, remaining credits expire and
        the account reverts to the free tier. Saved AI marking history remains viewable.
      </p>

      <h2 className="font-serif text-xl mt-6">7. Suspension and termination</h2>
      <p>
        We may suspend or terminate accounts that breach these Terms. You can stop using
        the service at any time via the customer portal.
      </p>

      <h2 className="font-serif text-xl mt-6">8. Disclaimer</h2>
      <p>
        AI marking is provided as a study aid and may make mistakes. It is not a
        substitute for an official examiner.
      </p>

      <h2 className="font-serif text-xl mt-6">9. Governing law</h2>
      <p>
        These Terms are governed by the laws of {LEGAL.countryOfBusiness}. Disputes will
        be brought before the courts of {LEGAL.countryOfBusiness}.
      </p>
    </LegalLayout>
  );
}