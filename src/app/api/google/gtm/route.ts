import { NextRequest, NextResponse } from 'next/server'
import { fetchGTMData } from '@/lib/gtm'

export async function POST(req: NextRequest) {
  try {
    const { accessToken, containerId } = await req.json()
    if (!accessToken) return NextResponse.json({ success: false, error: 'Token requis' }, { status: 401 })
    const data = await fetchGTMData(accessToken, containerId)
    return NextResponse.json({ success: true, gtm: data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
