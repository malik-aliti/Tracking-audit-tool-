import { NextRequest, NextResponse } from 'next/server'
import { fetchMetaData } from '@/lib/platforms'
export async function POST(req: NextRequest) {
  try {
    const { accessToken, pixelId } = await req.json()
    if (!accessToken) return NextResponse.json({ success: false, error: 'Token requis' }, { status: 401 })
    const data = await fetchMetaData(accessToken, pixelId)
    return NextResponse.json({ success: true, meta: data })
  } catch (err: any) { return NextResponse.json({ success: false, error: err.message }, { status: 500 }) }
}
