import { NextResponse } from 'next/server'
import { getLinkedInAuthUrl } from '@/lib/platforms'

export async function GET() {
  const state = Math.random().toString(36).slice(2)
  const authUrl = getLinkedInAuthUrl(state)
  return NextResponse.json({ authUrl })
}
