import { NextRequest, NextResponse } from 'next/server'
import { getMetaAuthUrl } from '@/lib/platforms'
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get('state') || 'default'
  return NextResponse.json({ authUrl: getMetaAuthUrl(state) })
}
