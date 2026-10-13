import './globals.css'

export const metadata = {
  title: 'YouTube Channel Search',
  description: 'Cari video dalam channel YouTube berdasarkan keyword',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
