import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ToastProvider from './components/ToastProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'NFT Bot',
  description: 'Trading bot dashboard'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
