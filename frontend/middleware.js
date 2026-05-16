import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublic = createRouteMatcher([
  '/',                    // landing page
  '/dashboard',           // browsable without login
  '/workspace/new',       // workspace builder UI visible, but chat action gates itself
  '/api/agent',           // SSE route (frontend won't call it unauthenticated)
])

export default clerkMiddleware((auth, req) => {
  // Only enforce auth when Clerk is configured — lets local dev work without keys
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !isPublic(req)) {
    auth().protect()
  }
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
