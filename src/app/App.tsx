'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AuditReport, ScanRawData, PlatformData, CheckResult } from '@/types'
import type { GTMData } from '@/lib/gtm'

// ─── Design tokens (Google/Material style) ────────────────────────────────────
const C = {
  blue:    '#1a73e8',
  blueBg:  '#e8f0fe',
  green:   '#34a853',
  greenBg: '#e6f4ea',
  red:     '#ea4335',
  redBg:   '#fce8e6',
  yellow:  '#f9ab00',
  yellowBg:'#fef7e0',
  purple:  '#9334e6',
  purpleBg:'#f3e8fd',
  text:    '#202124',
  sub:     '#5f6368',
  muted:   '#9aa0a6',
  border:  '#dadce0',
  bg:      '#f8f9fa',
  white:   '#ffffff',
  surface: '#ffffff',
}

const ST = {
  ok:     { bg: C.greenBg,  border: '#a8d5b5', text: C.green,  dot: C.green,  icon: 'check',  label: 'Conforme'  },
  warn:   { bg: C.yellowBg, border: '#f5d88a', text: '#b06000', dot: C.yellow, icon: 'warn',   label: 'Attention' },
  fail:   { bg: C.redBg,    border: '#f5c6c2', text: C.red,    dot: C.red,    icon: 'error',  label: 'Échec'     },
  manual: { bg: C.purpleBg, border: '#d4adfd', text: C.purple, dot: C.purple, icon: 'manual', label: 'Manuel'    },
  na:     { bg: C.bg,       border: C.border,  text: C.sub,    dot: C.muted,  icon: 'na',     label: 'N/A'       },
}

const CAT_META: Record<string, { label: string; icon: JSX.Element }> = {
  consent:      { label: 'Consentement & RGPD',    icon: <ShieldIcon /> },
  tag_base:     { label: 'Taggage de base',         icon: <TagIcon /> },
  ga4:          { label: 'GA4 & Analytics',         icon: <ChartIcon /> },
  google_ads:   { label: 'Google Ads',              icon: <AdsIcon /> },
  meta:         { label: 'Meta',                    icon: <MetaIcon /> },
  qa:           { label: 'Qualité & QA',            icon: <CheckCircleIcon /> },
  user_journey: { label: 'Parcours utilisateur',    icon: <MapIcon /> },
  performance:  { label: 'Performance',             icon: <SpeedIcon /> },
}

const TAG_COLORS: Record<string, [string, string]> = {
  Privacy: [C.yellowBg, '#b06000'], CMP: [C.yellowBg, '#b06000'],
  TCF: [C.yellowBg, '#b06000'], 'Consent Mode': [C.yellowBg, '#b06000'],
  Google: [C.blueBg, '#1557b0'], GTM: [C.blueBg, '#1557b0'],
  'Google Ads': ['#e8eaf6', '#3949ab'], 'Enhanced Conversions': ['#e8eaf6', '#3949ab'],
  GA4: [C.greenBg, '#137333'], Events: [C.greenBg, '#137333'],
  Meta: [C.purpleBg, '#6a1bcd'], CAPI: [C.purpleBg, '#6a1bcd'], 'Advanced Matching': [C.purpleBg, '#6a1bcd'],
  Attribution: ['#fce4ec', '#ad1457'], QA: [C.redBg, '#c62828'],
  Conversions: ['#e8eaf6', '#3949ab'], 'Micro-signaux': [C.greenBg, '#137333'],
  Performance: [C.yellowBg, '#b06000'], Platform: [C.blueBg, '#1557b0'],
}

// ─── SVG Icon components ──────────────────────────────────────────────────────
function ShieldIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function TagIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
}
function ChartIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
}
function AdsIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}
function MetaIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>
}
function CheckCircleIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
}
function MapIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
}
function SpeedIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><polyline points="12 6 12 12 16 14"/></svg>
}
function CopyIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
}
function CheckIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function XIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function ArrowRightIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
}
function ChevronDownIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
}
function ChevronUpIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
}
function SearchIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
}
function GoogleLogoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
function MetaLogoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0866FF">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5c-2.97 0-5.4-2.15-5.93-4.96L8 11l2 4 1-2 1 2 1-2 2 4 2.93-1.46C17.4 15.35 15 17.5 12 17.5zM12 6.5c1.12 0 2.14.37 2.96.99L12 12 9.04 7.49A4.48 4.48 0 0112 6.5zm4.87 8.71L14 10l-1 2-1-2-1 2-2-4-2 1.5A5.48 5.48 0 0112 6.5c3.04 0 5.5 2.46 5.5 5.5 0 1.27-.43 2.44-1.13 3.39l-.5-.68z"/>
    </svg>
  )
}
function AlertTriangleIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}

// ─── Status icon ──────────────────────────────────────────────────────────────
function StatusIcon({ status, size = 16 }: { status: string; size?: number }) {
  if (status === 'ok')     return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  if (status === 'fail')   return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  if (status === 'warn')   return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.yellow} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
  if (status === 'manual') return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
}

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 75 ? C.green : score >= 50 ? C.yellow : C.red
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8eaed" strokeWidth={size > 60 ? 8 : 6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size > 60 ? 8 : 6}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
          style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fill: C.text, fontSize: size < 60 ? 13 : 20, fontWeight: 700, fontFamily: 'Google Sans, sans-serif' }}>
          {score}
        </text>
      </svg>
      {label && <span style={{ fontSize: 11, color: C.sub, fontWeight: 500, textAlign: 'center' }}>{label}</span>}
    </div>
  )
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────
function TagPill({ tag }: { tag: string }) {
  const [bg, tc] = TAG_COLORS[tag] || [C.bg, C.sub]
  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 12, background: bg, color: tc, border: `1px solid ${tc}20`, letterSpacing: '0.01em' }}>
      {tag}
    </span>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000) }}
      style={{ position: 'absolute', top: 8, right: 8, background: done ? C.green : '#3c4043', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all .2s' }}>
      {done ? <CheckIcon size={12} color="white" /> : <CopyIcon size={12} color="#9aa0a6" />}
      <span style={{ fontSize: 10, fontWeight: 600, color: done ? 'white' : '#9aa0a6' }}>{done ? 'Copié' : 'Copier'}</span>
    </button>
  )
}

// ─── Impact badge ─────────────────────────────────────────────────────────────
function ImpactBadge({ impact }: { impact?: string }) {
  if (!impact || impact === 'low') return null
  const cfg = {
    critical: { bg: C.redBg,    color: C.red,    label: 'Critique' },
    high:     { bg: C.yellowBg, color: '#b06000', label: 'Haute' },
    medium:   { bg: C.blueBg,   color: C.blue,    label: 'Moyenne' },
  }[impact]
  if (!cfg) return null
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: cfg.bg, color: cfg.color, letterSpacing: '0.02em' }}>
      {cfg.label}
    </span>
  )
}

// ─── Platform connection chip ─────────────────────────────────────────────────
function PlatformChip({ name, logo, connected, onConnect }: { name: string; logo: JSX.Element; connected: boolean; onConnect: () => void }) {
  return (
    <button onClick={onConnect} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
      background: connected ? C.greenBg : C.white,
      border: `1px solid ${connected ? '#a8d5b5' : C.border}`,
      borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 500,
      color: connected ? '#137333' : C.sub, transition: 'all .2s',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    }}>
      {logo}
      <span>{name}</span>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? C.green : '#bdc1c6', flexShrink: 0 }} />
    </button>
  )
}

// ─── Check row ────────────────────────────────────────────────────────────────
function CheckRow({ check, onOpen }: { check: CheckResult; onOpen: (c: CheckResult) => void }) {
  const cfg = ST[check.status] || ST.na
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: hovered ? '#f8f9fa' : C.white, transition: 'background .15s', cursor: 'default' }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <StatusIcon status={check.status} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{check.label}</span>
          <ImpactBadge impact={check.impact} />
        </div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginBottom: 6 }}>{check.finding}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {check.tags.map(t => <TagPill key={t} tag={t} />)}
        </div>
      </div>
      <button
        onClick={() => onOpen(check)}
        style={{ flexShrink: 0, padding: '6px 14px', fontSize: 12, fontWeight: 500, border: `1px solid ${hovered ? C.blue : C.border}`, borderRadius: 6, background: hovered ? C.blueBg : C.white, color: hovered ? C.blue : C.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s', whiteSpace: 'nowrap' }}>
        Détails <ArrowRightIcon size={12} color={hovered ? C.blue : C.sub} />
      </button>
    </div>
  )
}

// ─── Check detail modal ───────────────────────────────────────────────────────
function CheckModal({ check, onClose, onGoFix }: { check: CheckResult; onClose: () => void; onGoFix: () => void }) {
  const cfg = ST[check.status] || ST.na
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(32,33,36,.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 300 }}>
      <div className="animate-in" style={{ background: C.white, borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ marginTop: 2 }}><StatusIcon status={check.status} size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <ImpactBadge impact={check.impact} />
                {check.tags.map(t => <TagPill key={t} tag={t} />)}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>{check.label}</h3>
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <span style={{ fontSize: 12, color: cfg.text, lineHeight: 1.6 }}>{check.finding}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s' }}>
              <XIcon size={14} color={C.sub} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {check.details?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Données analysées</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {check.details.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 6, background: C.bg, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                    <span style={{ color: C.blue, flexShrink: 0, marginTop: 3 }}>•</span>
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {check.actions?.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Actions recommandées</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {check.actions.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.blue, color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {check.consoleCommands?.length > 0 && (
            <section>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Commandes DevTools</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {check.consoleCommands.map((cmd, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <pre style={{ background: '#1e2228', borderRadius: 8, padding: '12px 50px 12px 16px', fontSize: 11, color: '#89b4fa', fontFamily: 'Roboto Mono, monospace', lineHeight: 1.7, overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {cmd}
                    </pre>
                    <CopyBtn text={cmd} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {(check.status === 'fail' || check.status === 'warn') ? (
            <button onClick={onGoFix} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, background: C.blue, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Voir le plan de correction <ArrowRightIcon size={14} color="white" />
            </button>
          ) : <span />}
          <button onClick={onClose} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, background: C.white, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Fix plan ─────────────────────────────────────────────────────────────────
function FixPlan({ checks }: { checks: CheckResult[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  const issues = checks.filter(c => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
      return (order[a.impact || 'medium'] ?? 2) - (order[b.impact || 'medium'] ?? 2)
    })
  const [done, setDone] = useState<Set<string>>(new Set())

  if (issues.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: C.sub }}>
      <div style={{ width: 56, height: 56, background: C.greenBg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <CheckCircleIcon size={28} color={C.green} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 4 }}>Aucun problème détecté</div>
      <div style={{ fontSize: 13, color: C.sub }}>Votre configuration de tracking semble conforme.</div>
    </div>
  )

  const critCount = issues.filter(i => i.impact === 'critical').length
  const highCount = issues.filter(i => i.impact === 'high').length

  return (
    <div>
      {/* Summary banner */}
      {(critCount > 0 || highCount > 0) && (
        <div style={{ background: C.redBg, border: `1px solid #f5c6c2`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <AlertTriangleIcon size={18} color={C.red} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 2 }}>
              {critCount > 0 && `${critCount} problème${critCount > 1 ? 's' : ''} critique${critCount > 1 ? 's' : ''}`}
              {critCount > 0 && highCount > 0 && ' · '}
              {highCount > 0 && `${highCount} haute${highCount > 1 ? 's' : ''} priorité`}
            </div>
            <div style={{ fontSize: 12, color: '#c62828' }}>Traitez les problèmes critiques en priorité pour éviter toute perte de données.</div>
          </div>
        </div>
      )}

      {/* Issues list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {issues.map((issue, idx) => {
          const isDone = done.has(issue.id)
          const isOpen = openIdx === idx
          return (
            <div key={issue.id} style={{ background: C.white, border: `1px solid ${isDone ? '#a8d5b5' : issue.status === 'fail' ? '#f5c6c2' : C.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .2s' }}>
              <div onClick={() => setOpenIdx(isOpen ? null : idx)} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', cursor: 'pointer', background: isDone ? C.greenBg : C.white }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, background: isDone ? C.green : C.blue, color: 'white' }}>
                  {isDone ? <CheckIcon size={14} color="white" /> : idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: isDone ? '#137333' : C.text }}>{issue.label}</span>
                    <ImpactBadge impact={issue.impact} />
                    {isDone && <span style={{ fontSize: 11, fontWeight: 600, color: C.green }}>· Corrigé</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>{issue.finding}</div>
                </div>
                <div style={{ flexShrink: 0, color: C.muted }}>
                  {isOpen ? <ChevronUpIcon size={16} color={C.sub} /> : <ChevronDownIcon size={16} color={C.sub} />}
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                  <h4 style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', margin: '14px 0 10px' }}>Plan d'action</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {issue.actions.map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.blue, color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>

                  {issue.consoleCommands && issue.consoleCommands.length > 0 && (
                    <>
                      <h4 style={{ fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: '.08em', textTransform: 'uppercase', margin: '14px 0 10px' }}>Vérification DevTools</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {issue.consoleCommands.map((cmd, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <pre style={{ background: '#1e2228', borderRadius: 8, padding: '10px 50px 10px 14px', fontSize: 11, color: '#89b4fa', fontFamily: 'Roboto Mono, monospace', lineHeight: 1.6, overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                              {cmd}
                            </pre>
                            <CopyBtn text={cmd} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button
                      onClick={() => setDone(prev => { const n = new Set(prev); isDone ? n.delete(issue.id) : n.add(issue.id); return n })}
                      style={{ padding: '7px 16px', fontSize: 12, fontWeight: 500, background: isDone ? C.green : C.white, color: isDone ? 'white' : C.sub, border: `1px solid ${isDone ? C.green : C.border}`, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s' }}>
                      {isDone ? <><CheckIcon size={12} color="white" /> Correctif appliqué</> : 'Marquer comme corrigé'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Loading steps ────────────────────────────────────────────────────────────
function LoadingView({ phase, phaseMsg, url }: { phase: string; phaseMsg: string; url: string }) {
  const steps = [
    { id: 'scan', label: 'Scan de la page', sub: 'DOM, cookies, réseau, scripts' },
    { id: 'platform', label: 'Données plateformes', sub: 'GA4, Google Ads, Meta' },
    { id: 'analyze', label: 'Analyse IA', sub: '30+ vérifications RGPD & tracking' },
  ]
  const activeStep = phase === 'scanning' ? 0 : phase === 'analyzing' ? 2 : 1

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.blue}`, borderRadius: '50%', margin: '0 auto 32px', animation: 'spin 0.8s linear infinite' }} />
      <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 6 }}>
        {phase === 'scanning' ? 'Analyse en cours' : 'Traitement des données'}
      </h2>
      <p style={{ fontSize: 13, color: C.sub, marginBottom: 32 }}>{url}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((step, i) => {
          const isActive = i === activeStep
          const isDone = i < activeStep
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: isActive ? C.blueBg : isDone ? C.greenBg : C.bg, border: `1px solid ${isActive ? '#c6d9fc' : isDone ? '#a8d5b5' : C.border}`, borderRadius: 10, textAlign: 'left', transition: 'all .3s' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: isActive ? C.blue : isDone ? C.green : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .3s' }}>
                {isDone ? <CheckIcon size={14} color="white" /> : isActive ? (
                  <div style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,.4)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                ) : <span style={{ fontSize: 11, fontWeight: 700, color: C.white }}>{i + 1}</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? C.blue : isDone ? '#137333' : C.sub }}>{step.label}</div>
                <div style={{ fontSize: 11, color: isActive ? C.blue : C.muted, opacity: 0.8 }}>{step.sub}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle')
  const [phaseMsg, setPhaseMsg] = useState('')
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'audit' | 'fixes' | 'platforms'>('audit')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [modalCheck, setModalCheck] = useState<CheckResult | null>(null)
  const [connections, setConnections] = useState<{ google?: { accessToken: string; propertyName?: string; measurementId?: string }; meta?: { accessToken: string; pixelName?: string } }>(() => {
    try { return JSON.parse(sessionStorage.getItem('trackaudit_connections') || '{}') } catch { return {} }
  })

  useEffect(() => {
    try { sessionStorage.setItem('trackaudit_connections', JSON.stringify(connections)) } catch {}
  }, [connections])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const payload = params.get('payload')
    if (payload) {
      try {
        const data = JSON.parse(decodeURIComponent(payload))
        if (data.platform === 'google') {
          setConnections(prev => ({ ...prev, google: { accessToken: data.accessToken, propertyName: data.ga4PropertyName, measurementId: data.ga4MeasurementId } }))
        } else if (data.platform === 'meta') {
          setConnections(prev => ({ ...prev, meta: { accessToken: data.accessToken, pixelName: data.pixelName } }))
        }
      } catch {}
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    if (report) {
      const cats = [...new Set(report.checks.map(c => c.category))]
      setOpenSections(Object.fromEntries(cats.map(c => [c, true])))
    }
  }, [report])

  useEffect(() => {
    const handleBrowserData = async (browserData: any) => {
      if (!browserData || browserData._source !== 'browser') return
      setUrl(browserData.url || '')
      setPhase('scanning')
      setPhaseMsg('Données navigateur reçues — analyse en cours...')
      setError('')
      setReport(null)
      try {
        const scanRes = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browserData }) })
        const scanJson = await scanRes.json()
        if (!scanJson.success) throw new Error(scanJson.error || 'Erreur scan')
        setPhase('analyzing')
        setPhaseMsg('Analyse IA — 30+ vérifications...')
        let platformData: PlatformData | undefined
        let gtmData: GTMData | undefined
        if (connections.google?.accessToken) {
          try {
            const r = await fetch('/api/google/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.google.accessToken }) })
            const j = await r.json()
            if (j.success) { platformData = { ...platformData, ga4: j.ga4, googleAds: j.googleAds }; if (j.gtm) gtmData = j.gtm }
          } catch {}
        }
        if (connections.meta?.accessToken) {
          try {
            const r = await fetch('/api/meta/pixel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.meta.accessToken }) })
            const j = await r.json()
            if (j.success) platformData = { ...platformData, meta: j.meta }
          } catch {}
        }
        const analyzeRes = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scanData: scanJson.data, platformData, gtmData }) })
        const analyzeJson = await analyzeRes.json()
        if (!analyzeJson.success) throw new Error(analyzeJson.error || 'Erreur analyse')
        setReport(analyzeJson.report)
        setPhase('done')
      } catch (err: any) {
        setError(err.message || 'Erreur inconnue')
        setPhase('error')
      }
    }
    ;(window as any).__trackaudit = handleBrowserData
    return () => { delete (window as any).__trackaudit }
  }, [connections])

  const connectGoogle = async () => { const res = await fetch('/api/google'); const { authUrl } = await res.json(); window.location.href = authUrl }
  const connectMeta = async () => { const res = await fetch('/api/meta'); const { authUrl } = await res.json(); window.location.href = authUrl }

  const runAudit = useCallback(async () => {
    if (!url.trim()) return
    setPhase('scanning')
    setPhaseMsg('Chargement de la page et scan du DOM, cookies, réseau...')
    setError('')
    setReport(null)
    try {
      const scanRes = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) })
      const scanJson = await scanRes.json()
      if (!scanJson.success) throw new Error(scanJson.error || 'Erreur de scan')
      const scanData: ScanRawData = scanJson.data

      setPhase('analyzing')
      setPhaseMsg('Connexion aux plateformes et analyse IA en cours...')
      let platformData: PlatformData | undefined
      let gtmData: GTMData | undefined

      if (connections.google?.accessToken) {
        try {
          const gRes = await fetch('/api/google/ga4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.google.accessToken }) })
          const gJson = await gRes.json()
          if (gJson.success) { platformData = { ...platformData, ga4: gJson.ga4, googleAds: gJson.googleAds }; if (gJson.gtm) gtmData = gJson.gtm }
        } catch {}
      }
      if (connections.meta?.accessToken) {
        try {
          const mRes = await fetch('/api/meta/pixel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: connections.meta.accessToken }) })
          const mJson = await mRes.json()
          if (mJson.success) platformData = { ...platformData, meta: mJson.meta }
        } catch {}
      }

      const analyzeRes = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scanData, platformData, gtmData }) })
      const analyzeJson = await analyzeRes.json()
      if (!analyzeJson.success) throw new Error(analyzeJson.error || 'Erreur d\'analyse')
      setReport(analyzeJson.report)
      setPhase('done')
    } catch (err: any) {
      setError(err.message || 'Erreur inconnue')
      setPhase('error')
    }
  }, [url, connections])

  const checks = report?.checks || []
  const categories = [...new Set(checks.map(c => c.category))]
  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const okCount = checks.filter(c => c.status === 'ok').length
  const manualCount = checks.filter(c => c.status === 'manual').length

  const isLoading = phase === 'scanning' || phase === 'analyzing'
  const showHero = phase === 'idle' || phase === 'error'

  return (
    <div style={{ fontFamily: "'Google Sans', 'Inter', system-ui, sans-serif", background: C.bg, minHeight: '100vh', color: C.text }}>

      {/* ── TOP NAVIGATION BAR ─────────────────────────────────────────────── */}
      <header style={{ background: C.white, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: C.blue, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SearchIcon size={16} color="white" />
            </div>
            <div>
              <span style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>TrackAudit</span>
              <span style={{ marginLeft: 6, fontSize: 11, color: C.muted, fontWeight: 400 }}>by Tracking Intelligence</span>
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Platform connections */}
          <div style={{ display: 'flex', gap: 8 }}>
            <PlatformChip name="Google" logo={<GoogleLogoIcon size={16} />} connected={!!connections.google} onConnect={connectGoogle} />
            <PlatformChip name="Meta" logo={<MetaLogoIcon size={16} />} connected={!!connections.meta} onConnect={connectMeta} />
          </div>
        </div>
      </header>

      {/* ── HERO / URL INPUT ───────────────────────────────────────────────── */}
      {showHero && (
        <div style={{ background: 'linear-gradient(180deg, #1a73e8 0%, #1558b0 100%)', padding: '64px 24px 80px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(255,255,255,.15)', borderRadius: 20, marginBottom: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.9)', fontWeight: 500 }}>Diagnostic complet en 60 secondes</span>
            </div>
            <h1 style={{ fontSize: 40, fontWeight: 700, color: 'white', letterSpacing: '-0.03em', marginBottom: 12, lineHeight: 1.2 }}>
              Auditez votre tracking
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,.75)', marginBottom: 36, lineHeight: 1.7, maxWidth: 520, margin: '0 auto 36px' }}>
              RGPD · Consent Mode v2 · GA4 · Google Ads Enhanced Conversions · Meta CAPI · Advanced Matching
            </p>

            {/* Search bar */}
            <div style={{ background: C.white, borderRadius: 12, padding: '6px 6px 6px 18px', boxShadow: '0 4px 24px rgba(0,0,0,.18)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SearchIcon size={18} color={C.muted} />
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runAudit()}
                placeholder="https://votre-site.com"
                style={{ flex: 1, padding: '8px 4px', fontSize: 15, border: 'none', outline: 'none', color: C.text, background: 'transparent' }}
              />
              <button
                onClick={runAudit}
                disabled={!url.trim()}
                style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600, background: url.trim() ? C.blue : '#e8eaed', color: url.trim() ? 'white' : C.muted, border: 'none', borderRadius: 8, cursor: url.trim() ? 'pointer' : 'not-allowed', transition: 'all .2s', whiteSpace: 'nowrap' }}>
                Lancer l'audit
              </button>
            </div>

            {/* Connection hint */}
            <div style={{ marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,.65)' }}>
              {!connections.google && !connections.meta ? (
                <span>
                  Connectez{' '}
                  <button onClick={connectGoogle} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.9)', cursor: 'pointer', fontWeight: 600, fontSize: 12, textDecoration: 'underline' }}>Google</button>
                  {' '}et{' '}
                  <button onClick={connectMeta} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.9)', cursor: 'pointer', fontWeight: 600, fontSize: 12, textDecoration: 'underline' }}>Meta</button>
                  {' '}pour un audit enrichi avec vos données réelles
                </span>
              ) : (
                <span style={{ color: '#86efac' }}>
                  <CheckIcon size={12} color="#86efac" />
                  {' '}{connections.google ? 'Google connecté' : ''}{connections.google && connections.meta ? ' · ' : ''}{connections.meta ? 'Meta connecté' : ''} — audit enrichi activé
                </span>
              )}
            </div>

            {error && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, fontSize: 13, color: 'white', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertTriangleIcon size={16} color="white" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LOADING STATE ──────────────────────────────────────────────────── */}
      {isLoading && (
        <div style={{ background: C.white, minHeight: 'calc(100vh - 64px)' }}>
          <LoadingView phase={phase} phaseMsg={phaseMsg} url={url} />
        </div>
      )}

      {/* ── RESULTS ────────────────────────────────────────────────────────── */}
      {phase === 'done' && report && (
        <div className="animate-in">
          {/* Score banner */}
          <div style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 0' }}>
              {/* Top row: score + stats + new audit button */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
                {/* Global score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <ScoreRing score={report.score.global} size={88} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }}>Score global</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: C.text, maxWidth: 300, lineHeight: 1.4, marginBottom: 6 }}>{report.aiSummary.headline}</div>
                    {report.aiSummary.estimated_data_loss && (
                      <div style={{ fontSize: 12, color: C.red, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertTriangleIcon size={13} color={C.red} />
                        {report.aiSummary.estimated_data_loss}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stat pills */}
                <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
                  {[
                    { n: okCount, color: C.green, bg: C.greenBg, label: 'Conformes' },
                    { n: warnCount, color: '#b06000', bg: C.yellowBg, label: 'Attention' },
                    { n: failCount, color: C.red, bg: C.redBg, label: 'Échecs' },
                    { n: manualCount, color: C.purple, bg: C.purpleBg, label: 'Manuels' },
                  ].map((s, i) => (
                    <div key={i} style={{ padding: '8px 14px', background: s.bg, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.n}</div>
                      <div style={{ fontSize: 10, color: s.color, opacity: 0.8, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                  <button
                    onClick={() => { setPhase('idle'); setReport(null) }}
                    style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, background: C.white, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', marginLeft: 4 }}>
                    ← Nouvel audit
                  </button>
                </div>
              </div>

              {/* AI insights */}
              {(report.aiSummary.priority_issues?.length > 0 || report.aiSummary.quick_wins?.length > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {report.aiSummary.priority_issues?.slice(0, 2).map((issue, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '6px 12px', background: C.redBg, border: `1px solid #f5c6c2`, borderRadius: 20, color: C.red, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangleIcon size={12} color={C.red} /> {issue}
                    </div>
                  ))}
                  {report.aiSummary.quick_wins?.slice(0, 1).map((win, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '6px 12px', background: C.greenBg, border: `1px solid #a8d5b5`, borderRadius: 20, color: '#137333', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckIcon size={12} color="#137333" /> {win}
                    </div>
                  ))}
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0, borderBottom: 'none', marginTop: 4 }}>
                {([
                  ['audit', 'Résultats d\'audit', checks.length],
                  ['fixes', 'Plan de correction', failCount + warnCount],
                  ['platforms', 'Plateformes', null],
                ] as const).map(([id, label, count]) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    style={{
                      padding: '10px 18px', fontSize: 13, fontWeight: activeTab === id ? 600 : 400,
                      color: activeTab === id ? C.blue : C.sub, background: 'none', border: 'none',
                      cursor: 'pointer', borderBottom: `3px solid ${activeTab === id ? C.blue : 'transparent'}`,
                      transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 7,
                    }}>
                    {label}
                    {count !== null && count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: activeTab === id ? C.blue : C.bg, color: activeTab === id ? 'white' : C.sub }}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main content */}
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px' }}>

            {/* Score breakdown cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Consentement', score: report.score.consent, icon: <ShieldIcon size={18} color={C.blue} /> },
                { label: 'Mesure GA4', score: report.score.measurement, icon: <ChartIcon size={18} color={C.blue} /> },
                { label: 'Conversions', score: report.score.conversion, icon: <AdsIcon size={18} color={C.blue} /> },
                { label: 'Confidentialité', score: report.score.privacy, icon: <ShieldIcon size={18} color={C.blue} /> },
              ].map((s, i) => {
                const color = s.score >= 75 ? C.green : s.score >= 50 ? C.yellow : C.red
                return (
                  <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>{s.label}</span>
                      {s.icon}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 8 }}>{s.score}</div>
                    <div style={{ height: 4, background: '#e8eaed', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s.score}%`, background: color, borderRadius: 2, transition: 'width 1s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ─ AUDIT TAB ─ */}
            {activeTab === 'audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {categories.map(cat => {
                  const catChecks = checks.filter(c => c.category === cat)
                  const catFail = catChecks.filter(c => c.status === 'fail').length
                  const catOk = catChecks.filter(c => c.status === 'ok').length
                  const isOpen = openSections[cat] !== false
                  const meta = CAT_META[cat]
                  return (
                    <div key={cat} style={{ background: C.white, border: `1px solid ${catFail > 0 ? '#f5c6c2' : C.border}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                      <div
                        onClick={() => setOpenSections(prev => ({ ...prev, [cat]: !prev[cat] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', borderBottom: isOpen ? `1px solid ${C.border}` : 'none', background: C.white }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.blueBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {meta?.icon ? <span style={{ color: C.blue }}>{meta.icon}</span> : <span style={{ color: C.blue }}><TagIcon size={16} color={C.blue} /></span>}
                        </div>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text }}>{meta?.label || cat}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {catFail > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 600, background: C.redBg, color: C.red, padding: '2px 10px', borderRadius: 20 }}>
                              {catFail} échec{catFail > 1 ? 's' : ''}
                            </span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 600, background: catOk === catChecks.length ? C.greenBg : C.bg, color: catOk === catChecks.length ? '#137333' : C.sub, padding: '2px 10px', borderRadius: 20 }}>
                            {catOk}/{catChecks.length}
                          </span>
                          {isOpen ? <ChevronUpIcon size={16} color={C.sub} /> : <ChevronDownIcon size={16} color={C.sub} />}
                        </div>
                      </div>
                      {isOpen && catChecks.map(check => (
                        <CheckRow key={check.id} check={check} onOpen={c => setModalCheck(c)} />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ─ FIXES TAB ─ */}
            {activeTab === 'fixes' && <FixPlan checks={checks} />}

            {/* ─ PLATFORMS TAB ─ */}
            {activeTab === 'platforms' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {/* Google card */}
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, background: C.blueBg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <GoogleLogoIcon size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Google</div>
                      <div style={{ fontSize: 11, color: C.sub }}>GA4 · Google Ads · GTM</div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: connections.google ? '#137333' : C.muted }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: connections.google ? C.green : '#bdc1c6' }} />
                      {connections.google ? 'Connecté' : 'Non connecté'}
                    </div>
                  </div>
                  {connections.google ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {connections.google.propertyName && (
                        <div style={{ padding: '8px 12px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ChartIcon size={14} color={C.blue} />
                          <span>GA4 : <strong>{connections.google.propertyName}</strong></span>
                        </div>
                      )}
                      {connections.google.measurementId && (
                        <div style={{ padding: '8px 12px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.sub, fontFamily: 'Roboto Mono, monospace' }}>
                          {connections.google.measurementId}
                        </div>
                      )}
                      {report.platformData?.ga4 && (
                        <div style={{ padding: '8px 12px', background: C.greenBg, borderRadius: 8, fontSize: 12, color: '#137333', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckIcon size={12} color="#137333" />
                          {report.platformData.ga4.conversionEvents.length} conversions configurées
                        </div>
                      )}
                    </div>
                  ) : (
                    <button onClick={connectGoogle} style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 500, background: C.blueBg, color: C.blue, border: `1px solid #c6d9fc`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <GoogleLogoIcon size={16} /> Connecter Google
                    </button>
                  )}
                </div>

                {/* Meta card */}
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, background: C.purpleBg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MetaLogoIcon size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Meta</div>
                      <div style={{ fontSize: 11, color: C.sub }}>Pixel · CAPI · Advanced Matching</div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: connections.meta ? '#137333' : C.muted }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: connections.meta ? C.green : '#bdc1c6' }} />
                      {connections.meta ? 'Connecté' : 'Non connecté'}
                    </div>
                  </div>
                  {connections.meta ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {connections.meta.pixelName && (
                        <div style={{ padding: '8px 12px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.text }}>
                          Pixel : <strong>{connections.meta.pixelName}</strong>
                        </div>
                      )}
                      {report.platformData?.meta && (
                        <>
                          <div style={{ padding: '8px 12px', background: report.platformData.meta.advancedMatchingEnabled ? C.greenBg : C.redBg, borderRadius: 8, fontSize: 12, color: report.platformData.meta.advancedMatchingEnabled ? '#137333' : C.red, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {report.platformData.meta.advancedMatchingEnabled ? <CheckIcon size={12} color="#137333" /> : <XIcon size={12} color={C.red} />}
                            Advanced Matching : {report.platformData.meta.advancedMatchingEnabled ? 'Actif' : 'Inactif'}
                          </div>
                          <div style={{ padding: '8px 12px', background: report.platformData.meta.capiConnected ? C.greenBg : C.redBg, borderRadius: 8, fontSize: 12, color: report.platformData.meta.capiConnected ? '#137333' : C.red, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {report.platformData.meta.capiConnected ? <CheckIcon size={12} color="#137333" /> : <XIcon size={12} color={C.red} />}
                            CAPI : {report.platformData.meta.capiConnected ? 'Connectée' : 'Non connectée'}
                          </div>
                          {report.platformData.meta.matchRate && (
                            <div style={{ padding: '8px 12px', background: C.bg, borderRadius: 8, fontSize: 12, color: C.sub }}>
                              Match rate : <strong style={{ color: C.text }}>{report.platformData.meta.matchRate}%</strong>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <button onClick={connectMeta} style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 500, background: C.purpleBg, color: C.purple, border: `1px solid #d4adfd`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <MetaLogoIcon size={16} /> Connecter Meta
                    </button>
                  )}
                </div>

                {/* Coming soon */}
                {['TikTok Ads', 'LinkedIn Ads'].map(name => (
                  <div key={name} style={{ background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 10, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 140, gap: 6, opacity: 0.6 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.muted }}>{name}</div>
                    <div style={{ fontSize: 11, color: C.muted, padding: '2px 10px', background: C.white, border: `1px solid ${C.border}`, borderRadius: 20 }}>Prochainement</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL ─────────────────────────────────────────────────────────── */}
      {modalCheck && (
        <CheckModal
          check={modalCheck}
          onClose={() => setModalCheck(null)}
          onGoFix={() => { setActiveTab('fixes'); setModalCheck(null) }}
        />
      )}
    </div>
  )
}
