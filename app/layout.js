export const metadata = {
  title: 'CareerTalker - AI Career Counselor',
  description: 'Voice-based AI career counseling',
  icons: {
    icon: '/career.png',
    shortcut: '/career.png',
    apple: '/career.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&family=Rubik:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}

