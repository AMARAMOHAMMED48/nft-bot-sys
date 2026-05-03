'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/offers',    label: 'Offres'     },
  { href: '/trades',    label: 'Trades'     },
  { href: '/logs',      label: 'Logs'       },
  { href: '/snipe',     label: 'Snipe'      },
  { href: '/config',    label: 'Config'     },
]

export default function Nav() {
  const path = usePathname()
  return (
    <nav className="nav">
      <Link href="/dashboard" className="nav-logo">NFT Bot</Link>
      <div className="nav-links">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href}
            className={`nav-link${path === l.href ? ' active' : ''}`}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
