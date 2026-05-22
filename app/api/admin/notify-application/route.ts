// app/api/admin/notify-application/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sendPushToAdmins } from '@/lib/send-push'

export async function POST(request: NextRequest) {
  try {
    const { applicantName, matricNumber, department } = await request.json()

    await sendPushToAdmins({
      title: '\uD83D\uDEF5 New runner application',
      body: `${applicantName ?? 'Someone'} (${matricNumber}) from ${department} wants to be a runner.`,
      url: '/admin/applications',
      tag: 'runner-application',
    })

    // Also try SMS to admin phone if configured
    if (process.env.TERMII_API_KEY && process.env.ADMIN_PHONE) {
      await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: process.env.ADMIN_PHONE,
          from: process.env.TERMII_SENDER_ID ?? 'CampusRun',
          sms: `New runner application: ${applicantName ?? 'Unknown'}, Matric: ${matricNumber}, Dept: ${department}. Review at /admin/applications`,
          type: 'plain',
          channel: 'generic',
          api_key: process.env.TERMII_API_KEY,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[notify-application]', err)
    return NextResponse.json({ success: false })
  }
}
