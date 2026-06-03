import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { analyzeTrackingData, calculateScore } from '@/lib/analyzer'
import type { ScanRawData, AuditReport, PlatformData, AISummary } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { scanData, platformData }: { scanData: ScanRawData; platformData?: PlatformData } = await req.json()
    const checks = analyzeTrackingData(scanData, platformData)
    const score = calculateScore(checks)
    const aiSummary = await generateAISummary(scanData, checks, score)
    const report: AuditReport = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: scanData.url, createdAt: new Date().toISOString(),
      score, checks, rawData: scanData, aiSummary, connectedPlatforms: [], platformData,
    }
    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

async function generateAISummary(raw: ScanRawData, checks: any[], score: any): Promise<AISummary> {
  const failChecks = checks.filter((c: any) => c.status === 'fail')
  const critChecks = checks.filter((c: any) => c.impact === 'critical')
  const prompt = `Tu es expert en tracking digital. Analyse ce rapport pour ${raw.url} et génère un résumé JSON.

Score: ${score.global}/100 | OK:${score.okCount} Warn:${score.warnCount} Fail:${score.failCount}
CMP: ${raw.cmpDetected || 'absent'} | GTM: ${raw.gtmContainers.filter((c:string)=>c.startsWith('GTM-')).join(',') || 'absent'}
GA4: ${raw.ga4Ids.join(',') || 'absent'} | Meta: ${raw.metaPixelIds.join(',') || 'absent'}
CAPI: ${raw.hasCAPI} | Consent Mode v2: ${raw.consentDefault ? 'oui' : 'non'}
Formulaires: ${raw.forms.length} | CTAs: ${raw.ctaElements} | Erreurs JS: ${raw.jsErrors.length}

Critiques: ${critChecks.map((c:any)=>c.finding).join(' | ') || 'Aucun'}
Échecs: ${failChecks.slice(0,3).map((c:any)=>c.finding).join(' | ') || 'Aucun'}

Réponds UNIQUEMENT en JSON (sans backticks):
{"headline":"Résumé en 1 phrase (max 120 chars)","priority_issues":["issue1","issue2","issue3"],"quick_wins":["action1 (<1h)","action2","action3"],"strengths":["point fort 1","point fort 2"],"estimated_data_loss":"% estimé de conversions/données perdues"}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content.find((b: any) => b.type === 'text')?.text || '{}'
    return JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, '').trim())
  } catch {
    return {
      headline: `Score de tracking ${score.global}/100 — ${score.failCount} problème(s) à corriger`,
      priority_issues: failChecks.slice(0, 3).map((c: any) => c.finding),
      quick_wins: checks.filter((c: any) => c.status === 'warn').slice(0, 3).map((c: any) => c.actions[0] || ''),
      strengths: checks.filter((c: any) => c.status === 'ok').slice(0, 2).map((c: any) => c.label),
      estimated_data_loss: score.failCount > 2 ? '20-40% de conversions potentiellement non trackées' : 'Impact limité',
    }
  }
}
