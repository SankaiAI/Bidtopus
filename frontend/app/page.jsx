import { redirect } from 'next/navigation'

// Root route redirects into the app — the landing page lives at /landing
export default function RootPage() {
  redirect('/dashboard')
}
