import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const payload = await req.json()
  const admin = createAdminClient()
  const { error } = await admin.from('users').insert(payload)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  
  // Create runner profile if needed
  if (payload.role === 'runner') {
    await admin.from('runner_profiles').insert({
      user_id: payload.id, is_available: false,
      total_deliveries: 0, total_earnings: 0, rating: 5.0,
    })
  }
  
  return NextResponse.json({ success: true })
}