import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'NFT Bot',
  description: 'Trading bot dashboard'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f0f13', color: '#e2e8f0' }}>
        {children}
      </body>
    </html>
  )
}
