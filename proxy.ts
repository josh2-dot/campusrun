import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Simple pass-through proxy — auth protection handled in each page
  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
