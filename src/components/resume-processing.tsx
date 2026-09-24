"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderStatus } from "@/lib/domain/order";

export function ResumeProcessing({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState("");

  if (
    status !== "payment_verified" &&
    status !== "processing" &&
    status !== "failed"
  ) {
    return null;
  }

  async function resume() {
    setIsResuming(true);
    setError("");

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/process`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || "The processing request could not be completed.",
        );
      }

      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The processing request could not be completed.",
      );
    } finally {
      setIsResuming(false);
    }
  }

  return (
    <div className="proof-action">
      <div>
        <strong>
          {status === "processing"
            ? "Processing is not complete"
            : "The quotation is ready to recover"}
        </strong>
        <p>
          {status === "processing"
            ? "Resume the job if the previous attempt stopped. An active lease may reject the request until it expires."
            : "The verified payment is already on file. Processing will not request another payment."}
        </p>
      </div>
      <button
        className="button button-primary"
        type="button"
        onClick={resume}
        disabled={isResuming}
      >
        {isResuming ? (
          <Loader2 className="spin" size={16} />
        ) : (
          <RefreshCw size={16} />
        )}
        Resume processing
      </button>
      {error ? (
        <div className="inline-alert inline-alert-error">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}
    </div>
  );
}
