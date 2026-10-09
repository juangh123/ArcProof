"use client";

import type { PublicArcConfig } from "@/lib/arc/config";
import { useWorkbenchOrder } from "@/components/use-workbench-order";
import { IntakePanel } from "@/components/workbench/intake-panel";
import { ResultPanel } from "@/components/workbench/result-panel";

export function Workbench({ config }: { config: PublicArcConfig }) {
  const { view, actions } = useWorkbenchOrder(config);

  return (
    <div className="workbench-grid">
      <IntakePanel config={config} view={view} actions={actions} />
      <ResultPanel order={view.order} isProcessing={view.isProcessing} />
    </div>
  );
}
