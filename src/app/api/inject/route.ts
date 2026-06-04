import { NextRequest, NextResponse } from 'next/server'

// Store temporaire en mémoire (par URL)
const store = new Map<string, any>()

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    if (!data.url) return NextResponse.json({ success: false, error: 'URL manquante' }, { status: 400 })
    store.set(data.url, { data, ts: Date.now() })
    // Nettoyer après 5 min
    setTimeout(() => store.delete(data.url), 300000)
    return NextResponse.json({ success: true, message: 'Données reçues' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ success: false, error: 'URL manquante' }, { status: 400 })
  const entry = store.get(url)
  if (!entry) return NextResponse.json({ success: false, found: false })
  return NextResponse.json({ success: true, found: true, data: entry.data, ts: entry.ts })
}
