import type { OrderEvent, OrderRecord } from "@/lib/domain/order";

export function serializeOrder(order: OrderRecord, events: OrderEvent[] = []) {
  return {
    id: order.id,
    publicId: order.publicId,
    status: order.status,
    sourceName: order.sourceName,
    sourceKind: order.sourceKind,
    quoteResult: order.quoteResult,
    extractionMode: order.extractionMode,
    paymentMemoId: order.paymentMemoId,
    amountDisplay: order.amountDisplay,
    amountAtomic18: order.amountAtomic18,
    amountAtomic6: order.amountAtomic6,
    network: order.network,
    chainId: order.chainId,
    txHash: order.txHash,
    payerAddress: order.payerAddress,
    blockNumber: order.blockNumber,
    blockHash: order.blockHash,
    paymentProof: order.paymentProof,
    errorMessage: order.errorMessage,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    verifiedAt: order.verifiedAt,
    processedAt: order.processedAt,
    proofUrl: `/proof/${order.publicId}`,
    events: events.map((event) => ({
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    })),
  };
}

export type SerializedOrder = ReturnType<typeof serializeOrder>;

