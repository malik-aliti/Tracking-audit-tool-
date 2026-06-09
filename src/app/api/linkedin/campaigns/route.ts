import { NextRequest, NextResponse } from 'next/server'
import { fetchLinkedInData } from '@/lib/platforms'

export async function POST(req: NextRequest) {
  try {
    const { accessToken, accountId } = await req.json()
    if (!accessToken) return NextResponse.json({ success: false, error: 'Missing accessToken' }, { status: 400 })

    const linkedin = await fetchLinkedInData(accessToken, accountId)
    if (!linkedin) return NextResponse.json({ success: false, error: 'Failed to fetch LinkedIn data' }, { status: 502 })

    return NextResponse.json({ success: true, linkedin })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
