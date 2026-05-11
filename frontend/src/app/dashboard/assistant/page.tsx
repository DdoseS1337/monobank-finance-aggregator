import { PageHeader } from '@/components/shared/page-header';
import { ChatSurface } from './chat-surface';

export default function AssistantPage() {
  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <PageHeader
        title="AI Асистент"
        description="Multi-agent (Analyst / Planner / Forecaster) з two-step confirmation для мутацій."
      />
      <div className="min-h-0 flex-1 rounded-xl border border-border bg-card">
        <ChatSurface />
      </div>
    </div>
  );
}
