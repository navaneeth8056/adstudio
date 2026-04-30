'use client'

import { EmptyState } from '@/components/ui/empty-state'

export default function WaitingListPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border px-6 py-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Waiting List</h2>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon="◷"
          title="Coming soon"
          description="Waiting list functionality will be added in a future update"
        />
      </div>
    </div>
  )
}
