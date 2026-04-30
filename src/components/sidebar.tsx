'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'

const NAV_ITEMS = [
  { href: '/clients',      label: 'Clients',      icon: '◈' },
  { href: '/photos',       label: 'Photo Repo',   icon: '⊞' },
  { href: '/events',       label: 'Events',        icon: '◎' },
  { href: '/studio',       label: 'Post Studio',  icon: '✦' },
  { href: '/draft',        label: 'Draft',         icon: '◉' },
  { href: '/waiting-list', label: 'Waiting List', icon: '◷' },
  { href: '/approved',     label: 'Approved',      icon: '✓' },
  { href: '/admin',        label: 'Admin',         icon: '⬡' },
] as const

interface SidebarProps {
  userEmail?: string
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-[200px] flex-shrink-0 border-r border-border flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <div className="font-serif text-[15px] text-gold tracking-wide">Auroville Ad</div>
        <div className="font-serif text-[15px] text-muted italic">AI Studio</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 text-[13px] rounded transition-all duration-150',
                isActive
                  ? 'bg-s3 border-l-[3px] border-gold text-text pl-[calc(0.75rem-3px)]'
                  : 'border-l-[3px] border-transparent text-muted hover:text-text hover:bg-s3'
              )}
            >
              <span className={cn('text-sm', isActive ? 'opacity-100' : 'opacity-60')}>
                {icon}
              </span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        {userEmail && (
          <p className="text-[10px] text-muted truncate" title={userEmail}>
            {userEmail}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted tracking-widest">v2.0</span>
          <button
            onClick={handleSignOut}
            className="text-[10px] text-muted hover:text-red transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
