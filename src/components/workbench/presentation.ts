import type { SerializedOrder } from "@/lib/api/serialize";

export function shorten(value: string | null | undefined, visible = 8) {
  if (!value) {
    return "—";
  }

  return `${value.slice(0, visible + 2)}…${value.slice(-visible)}`;
}

export function statusClass(status: SerializedOrder["status"]) {
  if (
    status === "payment_verified" ||
    status === "processing" ||
    status === "completed"
  ) {
    return "status-pill status-positive";
  }

  if (status === "payment_rejected" || status === "failed") {
    return "status-pill status-negative";
  }

  return "status-pill";
}

export function currentStep(order: SerializedOrder | null) {
  if (!order) {
    return 1;
  }

  if (order.status === "completed") {
    return 3;
  }

  if (
    order.status === "payment_verified" ||
    order.status === "processing" ||
    order.status === "failed"
  ) {
    return 3;
  }

  return 2;
}
