import { NextRequest, NextResponse } from 'next/server'
import { scanUrl } from '@/lib/scanner'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ success: false, error: 'URL requise' }, { status: 400 })
    let parsed: URL
    try { parsed = new URL(url.startsWith('http') ? url : `https://${url}`) }
    catch { return NextResponse.json({ success: false, error: 'URL invalide' }, { status: 400 }) }
    const data = await scanUrl(parsed.href)
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Erreur de scan' }, { status: 500 })
  }
}
