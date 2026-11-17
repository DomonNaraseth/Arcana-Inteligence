import { NextResponse } from "next/server";
import { WebhookSignatureError, billingProvider } from "@/lib/billing/provider";
import { fulfillFromSession, markUnsuccessful } from "@/lib/billing/service";
import { getSystemClient } from "@/lib/supabase/server";

/**
 * Payment provider webhook. Authenticity comes from the provider's signature
 * over the raw body — there is no user session here. Responses:
 *   400  bad signature / unparsable (provider should not retry a forgery)
 *   500  our own failure (provider retries; fulfilment is idempotent)
 *   200  handled or deliberately ignored
 */
export async function POST(req: Request) {
  const provider = billingProvider();
  if (!provider) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  let event;
  try {
    event = provider.parseWebhook(rawBody, req.headers.get("stripe-signature"));
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn("[arcana] webhook rejected:", err.message);
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  try {
    const supabase = getSystemClient();
    const paymentId =
      event.session?.paymentId && /^[0-9a-f-]{36}$/i.test(event.session.paymentId)
        ? event.session.paymentId
        : null;

    // audit trail only — safety comes from idempotent fulfilment, so a
    // redelivered event is processed again rather than skipped
    await supabase.rpc("arcana_record_payment_event", {
      p_provider: provider.id,
      p_event_id: event.id || `no-id-${Date.now()}`,
      p_type: event.type,
      p_payment_id: paymentId,
    });

    if (event.session) {
      if (event.kind === "paid") {
        const result = await fulfillFromSession(supabase, event.session);
        if (!result.ok) {
          console.error("[arcana] webhook could not fulfil payment:", result.reason, paymentId);
          await supabase.rpc("arcana_log_error", {
            p_route: "/api/billing/webhook",
            p_code: "payment_not_fulfilled",
            p_message: `${event.type} ${paymentId ?? "?"}: ${result.reason}`,
          });
        }
      } else if (event.kind === "failed" || event.kind === "expired") {
        await markUnsuccessful(supabase, event.session, event.kind);
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[arcana] webhook processing failed:", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
