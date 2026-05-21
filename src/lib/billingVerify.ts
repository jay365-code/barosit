/**
 * Toss Payments & Stripe S2S (Server-to-Server) Webhook Verification Utilities
 * Aligned with docs/saas-core-blueprint.md Section 3.
 */

export interface TossVerificationResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface StripeVerificationResult {
  success: boolean;
  message: string;
  event?: any;
}

/**
 * 1. Toss Payments S2S Webhook Cross-Verification
 * When a webhook is received, we query the Toss API directly to verify the ledger.
 *
 * @param orderId Toss order ID to inspect
 * @param incomingAmount Expected total amount
 * @param incomingStatus Expected status (e.g., "DONE", "CANCELED")
 * @param secretKey Toss Payments secret key (will fallback to env variables)
 */
export async function verifyTossWebhook(
  orderId: string,
  incomingAmount: number,
  incomingStatus: string,
  secretKey?: string
): Promise<TossVerificationResult> {
  const finalKey = secretKey || (typeof process !== "undefined" ? process.env.TOSS_SECRET_KEY : undefined);
  
  if (!finalKey) {
    return {
      success: false,
      message: "Toss Payments secret key (TOSS_SECRET_KEY) is not configured.",
    };
  }

  try {
    const authHeader = typeof Buffer !== "undefined"
      ? `Basic ${Buffer.from(finalKey + ":").toString("base64")}`
      : `Basic ${btoa(finalKey + ":")}`;

    // Toss Payments Order S2S Inquiry API
    const response = await fetch(`https://api.tosspayments.com/v1/payments/orders/${orderId}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `Toss S2S API returned non-OK status: ${response.status}. Response: ${errorText}`,
      };
    }

    const pgData = await response.json();

    // Verify amount and status against the trusted Toss ledger
    const isAmountValid = pgData.totalAmount === incomingAmount;
    const isStatusValid = pgData.status === incomingStatus;

    if (!isAmountValid) {
      return {
        success: false,
        message: `Amount mismatch: incoming ${incomingAmount} vs ledger ${pgData.totalAmount}`,
        data: pgData,
      };
    }

    if (!isStatusValid) {
      return {
        success: false,
        message: `Status mismatch: incoming "${incomingStatus}" vs ledger "${pgData.status}"`,
        data: pgData,
      };
    }

    return {
      success: true,
      message: "Toss Payments S2S cross-verification completed successfully.",
      data: pgData,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to complete S2S verification process: ${error?.message || error}`,
    };
  }
}

/**
 * 2. Stripe Webhook Signature Verification
 * Uses native Web Crypto APIs to verify HMAC-SHA256 signatures, avoiding node-only dependencies.
 *
 * @param payload Raw string payload of the request
 * @param signatureHeader Stripe-Signature header (t=...,v1=...)
 * @param endpointSecret Stripe webhook endpoint secret (will fallback to env variables)
 */
export async function verifyStripeWebhook(
  payload: string,
  signatureHeader: string,
  endpointSecret?: string
): Promise<StripeVerificationResult> {
  const finalSecret = endpointSecret || (typeof process !== "undefined" ? process.env.STRIPE_WEBHOOK_SECRET : undefined);

  if (!finalSecret) {
    return {
      success: false,
      message: "Stripe Webhook Secret (STRIPE_WEBHOOK_SECRET) is not configured.",
    };
  }

  try {
    // Parse the stripe signature header (e.g. t=123,v1=abc)
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) {
      return { success: false, message: "Invalid stripe signature header format." };
    }

    const timestamp = timestampPart.split("=")[1];
    const signature = signaturePart.split("=")[1];

    // Compute signature using Web Crypto HMAC-SHA256
    const encoder = new TextEncoder();
    const secretKeyData = encoder.encode(finalSecret);
    const messageData = encoder.encode(`${timestamp}.${payload}`);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      secretKeyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      messageData
    );

    // Convert computed signature buffer to hex
    const computedSignatureHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computedSignatureHex !== signature) {
      return {
        success: false,
        message: "Stripe webhook signature validation failed.",
      };
    }

    const parsedEvent = JSON.parse(payload);
    return {
      success: true,
      message: "Stripe webhook signature verified successfully.",
      event: parsedEvent,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Failed to verify Stripe signature: ${error?.message || error}`,
    };
  }
}
