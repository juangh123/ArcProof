"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, RefObject } from "react";
import type { PublicArcConfig } from "@/lib/arc/config";
import { payOrderWithArc } from "@/lib/arc/wallet";
import type { SerializedOrder } from "@/lib/api/serialize";
import {
  ApiRequestError,
  clearStoredOrder,
  createFixtureHash,
  createOrderRequest,
  fetchOrder,
  readStoredOrder,
  requestOrderProcessing,
  requestPaymentVerification,
  storeOrder,
} from "@/lib/api/order-client";
import { currentStep } from "@/components/workbench/presentation";

export type WorkbenchView = {
  fileInput: RefObject<HTMLInputElement | null>;
  order: SerializedOrder | null;
  file: File | null;
  step: number;
  isCreating: boolean;
  isPaying: boolean;
  isProcessing: boolean;
  isRestoring: boolean;
  pendingTxHash: `0x${string}` | null;
  paymentReady: boolean;
  paymentExpired: boolean;
  paymentTargetMatches: boolean;
  supportUrl: string;
  notice: string;
  error: string;
};

export type WorkbenchActions = {
  selectFile: (event: ChangeEvent<HTMLInputElement>) => void;
  createOrder: (options: { sample: boolean; file?: File }) => Promise<void>;
  processOrder: (
    orderId: string,
    existingOrder?: SerializedOrder,
  ) => Promise<void>;
  continueVerification: () => Promise<void>;
  payWithArc: () => Promise<void>;
  copyMemo: () => Promise<void>;
  resetOrder: () => void;
};

export function useWorkbenchOrder(config: PublicArcConfig) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState<SerializedOrder | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const step = currentStep(order);
  const paymentReady = Boolean(config.configured && order);
  const paymentExpired = Boolean(
    order && now >= new Date(order.expiresAt).getTime(),
  );
  const paymentTargetMatches = Boolean(
    order &&
      config.recipientAddress &&
      order.network === config.network &&
      order.chainId === config.chainId &&
      order.recipientAddress.toLowerCase() ===
        config.recipientAddress.toLowerCase(),
  );
  const supportUrl = order
    ? `https://github.com/juangh123/ArcProof/issues/new?template=refund-or-support.yml&title=${encodeURIComponent(
        `[Support] ${order.publicId}`,
      )}`
    : "";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const storedOrder = readStoredOrder();

    if (!storedOrder) {
      return;
    }

    const stored = storedOrder;
    let active = true;

    async function restoreOrder() {
      setIsRestoring(true);
      setNotice("Restoring your active order.");

      try {
        let restoredOrder = await fetchOrder(stored.orderId);

        if (!active) {
          return;
        }

        const pendingHash =
          restoredOrder.status === "awaiting_payment" ||
          restoredOrder.status === "verifying"
            ? stored.txHash
            : undefined;

        setOrder(restoredOrder);
        setPendingTxHash(pendingHash ?? null);
        storeOrder(restoredOrder.id, pendingHash);

        if (pendingHash) {
          setIsPaying(true);
          setNotice("Resuming Arc payment verification.");
          restoredOrder = await requestPaymentVerification(
            restoredOrder.id,
            pendingHash,
          );

          if (!active) {
            return;
          }

          setOrder(restoredOrder);
          setPendingTxHash(null);
          storeOrder(restoredOrder.id);
          setNotice("Arc payment verified.");
        }

        if (restoredOrder.status === "payment_verified") {
          setIsProcessing(true);
          setNotice("Extracting line items.");
          restoredOrder = await requestOrderProcessing(restoredOrder.id);

          if (!active) {
            return;
          }

          setOrder(restoredOrder);
          setNotice("Structured quotation generated.");
        } else if (restoredOrder.status === "processing") {
          setNotice(
            "Processing is already in progress. Resume it if the previous attempt stopped.",
          );
        } else if (restoredOrder.status === "failed") {
          setNotice("The previous processing attempt needs a retry.");
        } else if (restoredOrder.status === "completed") {
          setNotice("Completed order restored.");
        } else {
          setNotice("Active order restored. Continue payment when ready.");
        }
      } catch (requestError) {
        if (!active) {
          return;
        }

        if (requestError instanceof ApiRequestError) {
          if (requestError.order) {
            setOrder(requestError.order);
            storeOrder(requestError.order.id);
          }

          if (requestError.status === 404) {
            clearStoredOrder();
          }
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "The active order could not be restored.",
        );
      } finally {
        if (active) {
          setIsPaying(false);
          setIsProcessing(false);
          setIsRestoring(false);
        }
      }
    }

    void restoreOrder();

    return () => {
      active = false;
    };
  }, []);

  async function createOrder(options: { sample: boolean; file?: File }) {
    setIsCreating(true);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();

      if (options.sample) {
        formData.set("sample", "true");
      } else if (options.file) {
        formData.set("file", options.file);
      }

      const created = await createOrderRequest(formData);

      setOrder(created);
      setPendingTxHash(null);
      storeOrder(created.id);
      setNotice("Payment request created.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The document could not be prepared.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function processOrder(
    orderId: string,
    existingOrder?: SerializedOrder,
  ) {
    setIsProcessing(true);
    setError("");

    try {
      if (existingOrder && existingOrder.status === "completed") {
        return;
      }

      const processedOrder = await requestOrderProcessing(orderId);

      setOrder(processedOrder);
      storeOrder(processedOrder.id);
      setNotice("Structured quotation generated.");
    } catch (requestError) {
      if (
        requestError instanceof ApiRequestError &&
        requestError.order
      ) {
        setOrder(requestError.order);
        storeOrder(requestError.order.id);
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "The quotation could not be processed.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function verifyPayment(orderId: string, txHash: `0x${string}`) {
    const verifiedOrder = await requestPaymentVerification(orderId, txHash);

    setOrder(verifiedOrder);
    setPendingTxHash(null);
    storeOrder(verifiedOrder.id);
    setNotice("Arc payment verified.");
    await processOrder(orderId, verifiedOrder);
  }

  function handlePaymentError(
    paymentError: unknown,
    submittedTxHash: `0x${string}` | null,
  ) {
    if (paymentError instanceof ApiRequestError && paymentError.order) {
      setOrder(paymentError.order);

      if (paymentError.order.status === "payment_rejected") {
        setPendingTxHash(null);
        storeOrder(paymentError.order.id);
      } else if (submittedTxHash) {
        setPendingTxHash(submittedTxHash);
        storeOrder(paymentError.order.id, submittedTxHash);
      }
    }

    setError(
      paymentError instanceof Error
        ? paymentError.message
        : "The Arc payment could not be completed.",
    );
  }

  async function continueVerification() {
    if (!order || !pendingTxHash) {
      return;
    }

    setIsPaying(true);
    setError("");

    try {
      await verifyPayment(order.id, pendingTxHash);
    } catch (verificationError) {
      handlePaymentError(verificationError, pendingTxHash);
    } finally {
      setIsPaying(false);
    }
  }

  async function payWithArc() {
    if (!order) {
      return;
    }

    if (paymentExpired) {
      setError(
        "This payment request expired. Start a new order to request a fresh payment.",
      );
      return;
    }

    setIsPaying(true);
    setError("");
    setNotice("Approve the USDC payment in your wallet.");
    let submittedTxHash: `0x${string}` | null = null;

    try {
      const txHash =
        config.paymentMode === "fixture"
          ? createFixtureHash()
          : await payOrderWithArc({ config, order });

      submittedTxHash = txHash;
      setPendingTxHash(txHash);
      storeOrder(order.id, txHash);
      setNotice("Transaction submitted to Arc.");
      await verifyPayment(order.id, txHash);
    } catch (paymentError) {
      handlePaymentError(paymentError, submittedTxHash);
    } finally {
      setIsPaying(false);
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;

    setFile(selected);
    setError("");
  }

  function resetOrder() {
    clearStoredOrder();
    setPendingTxHash(null);
    setOrder(null);
    setFile(null);
    setNotice("");
    setError("");

    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function copyMemo() {
    if (!order) {
      return;
    }

    await navigator.clipboard.writeText(order.paymentMemoId);
    setNotice("Memo identifier copied.");
  }

  return {
    view: {
      fileInput,
      order,
      file,
      step,
      isCreating,
      isPaying,
      isProcessing,
      isRestoring,
      pendingTxHash,
      paymentReady,
      paymentExpired,
      paymentTargetMatches,
      supportUrl,
      notice,
      error,
    } satisfies WorkbenchView,
    actions: {
      selectFile,
      createOrder,
      processOrder,
      continueVerification,
      payWithArc,
      copyMemo,
      resetOrder,
    } satisfies WorkbenchActions,
  };
}
