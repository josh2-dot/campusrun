// app/api/admin/upload-image/route.ts
// Admin uploads a menu item image — stores in Supabase Storage, updates menu_items.image_url

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const itemId = formData.get('itemId') as string | null

  if (!file || !itemId) return NextResponse.json({ error: 'Missing file or itemId' }, { status: 400 })

  // Validate type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  }

  // Limit 2MB
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be under 2MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `menu-items/${itemId}.${ext}`
  const bytes = await file.arrayBuffer()

  const admin = createAdminClient()

  const { error: uploadError } = await admin.storage
    .from('menu-images')
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from('menu-images').getPublicUrl(path)

  // Update menu item
  const { error: updateError } = await admin
    .from('menu_items')
    .update({ image_url: publicUrl })
    .eq('id', itemId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, url: publicUrl })
}
