import LegalLayout from "./LegalLayout";
import { LEGAL } from "./legalConfig";

export default function Refund() {
  return (
    <LegalLayout title="Refund Policy" updated="22 June 2026">
      <p>
        We want you to be happy with {LEGAL.tradingName}. This policy explains when and
        how you can request a refund.
      </p>

      <h2 className="font-serif text-xl mt-6">1. Refund window</h2>
      <p>
        You may request a refund within <strong>{LEGAL.refundWindowDays} days</strong> of
        any payment if the service did not meet your reasonable expectations. After
        {" "}{LEGAL.refundWindowDays} days, payments are non-refundable.
      </p>

      <h2 className="font-serif text-xl mt-6">2. Free trial</h2>
      <p>
        Math Pro starts with a 7-day free trial. You will not be charged if you cancel
        before the trial ends.
      </p>

      <h2 className="font-serif text-xl mt-6">3. Top-up credits</h2>
      <p>
        Unused top-up credits can be refunded within {LEGAL.refundWindowDays} days of
        purchase, provided no more than 5 credits have been spent. After consumption
        credits are non-refundable.
      </p>

      <h2 className="font-serif text-xl mt-6">4. How to request a refund</h2>
      <p>
        Email{" "}
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
        {" "}with your account email and the transaction date. Refunds are processed by
        our Merchant of Record, Paddle.com Market Limited, back to the original payment
        method, usually within 5–10 business days.
      </p>

      <h2 className="font-serif text-xl mt-6">5. Chargebacks</h2>
      <p>
        Please contact us before filing a chargeback — we can usually resolve issues
        faster directly.
      </p>
    </LegalLayout>
  );
}