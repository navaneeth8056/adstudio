interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
      {icon && <span className="text-3xl opacity-30">{icon}</span>}
      <p className="text-sm text-muted">{title}</p>
      {description && <p className="text-xs text-muted opacity-70 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}
