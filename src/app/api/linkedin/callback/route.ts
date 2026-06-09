import { NextRequest, NextResponse } from 'next/server'
import { exchangeLinkedInCode, fetchLinkedInData } from '@/lib/platforms'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const base = process.env.NEXT_PUBLIC_BASE_URL || ''

  if (!code) {
    return NextResponse.redirect(`${base}/?error=linkedin_no_code`)
  }

  const tokens = await exchangeLinkedInCode(code)
  if (!tokens?.access_token) {
    return NextResponse.redirect(`${base}/?error=linkedin_token_failed`)
  }

  const linkedinData = await fetchLinkedInData(tokens.access_token)

  const payload = encodeURIComponent(JSON.stringify({
    platform: 'linkedin',
    accessToken: tokens.access_token,
    accountName: linkedinData?.accountName,
    accountId: linkedinData?.accountId,
    currency: linkedinData?.currency,
  }))

  return NextResponse.redirect(`${base}/?linkedin_connected=1&payload=${payload}&state=${state || ''}`)
}
