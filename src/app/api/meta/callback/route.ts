import { NextRequest, NextResponse } from 'next/server'
import { exchangeMetaCode, fetchMetaData } from '@/lib/platforms'
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state') || ''
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=meta_auth_failed`)
  try {
    const tokens = await exchangeMetaCode(code)
    if (!tokens?.access_token) throw new Error('No access token')
    const metaData = await fetchMetaData(tokens.access_token)
    const payload = encodeURIComponent(JSON.stringify({ platform: 'meta', accessToken: tokens.access_token, pixelId: metaData?.pixelId, pixelName: metaData?.pixelName }))
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?meta_connected=1&payload=${payload}&state=${state}`)
  } catch (err) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/?error=meta_callback_failed`)
  }
}
