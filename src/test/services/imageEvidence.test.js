import { describe, it, expect } from 'vitest'
import {
  dataUrlToBytes,
  extractExif,
  exifDateToIso,
  evidenceIntegrity,
  sha256Hex,
} from '@/utils/imageEvidence'

/**
 * Builds a real little-endian JPEG/APP1/TIFF structure rather than mocking the
 * parser's input, so these tests exercise the actual byte walking.
 *
 * Layout: SOI, APP1(len, "Exif\0\0", TIFF), EOI.
 * IFD0 holds pointers to an Exif sub-IFD (DateTimeOriginal) and a GPS IFD.
 */
function buildJpegWithExif({ dateTime = null, lat = null, latRef = 'N', lng = null, lngRef = 'E' } = {}) {
  const tiff = []
  const u16 = (v) => [v & 0xff, (v >> 8) & 0xff]
  const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]

  tiff.push(0x49, 0x49) // 'II' little-endian
  tiff.push(...u16(0x002a))
  tiff.push(...u32(8)) // IFD0 at offset 8

  const wantExif = !!dateTime
  const wantGps = lat != null || lng != null
  const ifd0Count = (wantExif ? 1 : 0) + (wantGps ? 1 : 0)

  // IFD0 starts at 8: count(2) + entries(12 each) + next(4)
  const ifd0Size = 2 + ifd0Count * 12 + 4
  let cursor = 8 + ifd0Size

  const exifIfdOffset = cursor
  const exifIfdSize = wantExif ? 2 + 12 + 4 : 0
  cursor += exifIfdSize
  const dateValueOffset = cursor
  if (wantExif) cursor += 20

  const gpsIfdOffset = cursor
  const gpsEntryCount = (lat != null ? 2 : 0) + (lng != null ? 2 : 0)
  const gpsIfdSize = wantGps ? 2 + gpsEntryCount * 12 + 4 : 0
  cursor += gpsIfdSize
  const latValueOffset = cursor
  if (lat != null) cursor += 24
  const lngValueOffset = cursor
  if (lng != null) cursor += 24

  // ── IFD0
  tiff.push(...u16(ifd0Count))
  if (wantExif) {
    tiff.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfdOffset))
  }
  if (wantGps) {
    tiff.push(...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsIfdOffset))
  }
  tiff.push(...u32(0))

  // ── Exif sub-IFD
  if (wantExif) {
    tiff.push(...u16(1))
    tiff.push(...u16(0x9003), ...u16(2), ...u32(20), ...u32(dateValueOffset))
    tiff.push(...u32(0))
    const padded = dateTime.padEnd(19, ' ').slice(0, 19)
    for (const ch of padded) tiff.push(ch.charCodeAt(0))
    tiff.push(0)
  }

  // ── GPS IFD
  if (wantGps) {
    tiff.push(...u16(gpsEntryCount))
    if (lat != null) {
      tiff.push(...u16(0x0001), ...u16(2), ...u32(2), latRef.charCodeAt(0), 0, 0, 0)
      tiff.push(...u16(0x0002), ...u16(5), ...u32(3), ...u32(latValueOffset))
    }
    if (lng != null) {
      tiff.push(...u16(0x0003), ...u16(2), ...u32(2), lngRef.charCodeAt(0), 0, 0, 0)
      tiff.push(...u16(0x0004), ...u16(5), ...u32(3), ...u32(lngValueOffset))
    }
    tiff.push(...u32(0))

    // Degrees/minutes/seconds as RATIONALs, seconds scaled by 100.
    const dms = (dec) => {
      const d = Math.floor(dec)
      const m = Math.floor((dec - d) * 60)
      const s = Math.round(((dec - d) * 60 - m) * 60 * 100)
      return [...u32(d), ...u32(1), ...u32(m), ...u32(1), ...u32(s), ...u32(100)]
    }
    if (lat != null) tiff.push(...dms(lat))
    if (lng != null) tiff.push(...dms(lng))
  }

  const app1Payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
  const length = app1Payload.length + 2
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, (length >> 8) & 0xff, length & 0xff,
    ...app1Payload,
    0xff, 0xd9,
  ])
}

describe('exifDateToIso', () => {
  it('parses the EXIF date format', () => {
    expect(exifDateToIso('2026:07:15 14:30:00')).toBe('2026-07-15T14:30:00.000Z')
  })

  it('returns null for anything else', () => {
    expect(exifDateToIso('2026-07-15')).toBeNull()
    expect(exifDateToIso('')).toBeNull()
    expect(exifDateToIso(null)).toBeNull()
    expect(exifDateToIso('not a date at all')).toBeNull()
  })
})

describe('dataUrlToBytes', () => {
  it('decodes a base64 data URL', () => {
    // "Hi" => SGk=
    expect(Array.from(dataUrlToBytes('data:text/plain;base64,SGk='))).toEqual([72, 105])
  })

  it('returns null for non-data or non-base64 URLs', () => {
    expect(dataUrlToBytes('https://example.com/a.jpg')).toBeNull()
    expect(dataUrlToBytes('data:text/plain,hello')).toBeNull()
    expect(dataUrlToBytes(null)).toBeNull()
    expect(dataUrlToBytes(123)).toBeNull()
  })
})

describe('extractExif', () => {
  it('reads DateTimeOriginal', () => {
    const result = extractExif(buildJpegWithExif({ dateTime: '2026:07:15 14:30:00' }))
    expect(result.status).toBe('present')
    expect(result.capturedAt).toBe('2026-07-15T14:30:00.000Z')
  })

  it('reads GPS coordinates as decimal degrees', () => {
    const result = extractExif(buildJpegWithExif({ lat: 10.3157, lng: 123.8854 }))
    expect(result.status).toBe('present')
    expect(result.latitude).toBeCloseTo(10.3157, 3)
    expect(result.longitude).toBeCloseTo(123.8854, 3)
  })

  it('applies S and W hemisphere refs as negative', () => {
    const result = extractExif(
      buildJpegWithExif({ lat: 33.8688, latRef: 'S', lng: 151.2093, lngRef: 'W' }),
    )
    expect(result.latitude).toBeLessThan(0)
    expect(result.longitude).toBeLessThan(0)
    expect(result.latitude).toBeCloseTo(-33.8688, 3)
  })

  it('reads date and GPS together', () => {
    const result = extractExif(
      buildJpegWithExif({ dateTime: '2026:03:01 08:00:00', lat: 14.5995, lng: 120.9842 }),
    )
    expect(result.capturedAt).toBe('2026-03-01T08:00:00.000Z')
    expect(result.latitude).toBeCloseTo(14.5995, 3)
  })

  it('reports absent for a JPEG with no EXIF', () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    expect(extractExif(bare).status).toBe('absent')
  })

  it('reports unreadable for non-JPEG or truncated input', () => {
    expect(extractExif(new Uint8Array([1, 2, 3])).status).toBe('unreadable')
    expect(extractExif(new Uint8Array()).status).toBe('unreadable')
    expect(extractExif(null).status).toBe('unreadable')
  })

  it('never throws on corrupted EXIF', () => {
    const good = buildJpegWithExif({ dateTime: '2026:07:15 14:30:00', lat: 10, lng: 120 })
    // Corrupt bytes throughout the EXIF block; the parser must degrade, not throw.
    for (let i = 6; i < good.length; i += 3) {
      const corrupted = Uint8Array.from(good)
      corrupted[i] = 0xff
      expect(() => extractExif(corrupted)).not.toThrow()
    }
  })
})

describe('sha256Hex', () => {
  it('hashes bytes to lowercase hex', async () => {
    const hash = await sha256Hex(new Uint8Array([97, 98, 99])) // "abc"
    if (hash === null) return // no SubtleCrypto in this environment
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('returns null for empty input', async () => {
    expect(await sha256Hex(new Uint8Array())).toBeNull()
    expect(await sha256Hex(null)).toBeNull()
  })
})

describe('evidenceIntegrity', () => {
  const report = { period_start: '2026-07-01', period_end: '2026-07-31' }

  it('marks legacy rows as not analysed rather than suspicious', () => {
    const result = evidenceIntegrity({ exif_status: null })
    expect(result.suspicious).toBe(false)
    expect(result.flags[0].text).toMatch(/not analysed/i)
  })

  it('treats stripped EXIF as a warning, never an alert', () => {
    // Screenshots and messaging apps strip EXIF routinely — an absence to weigh.
    const result = evidenceIntegrity({ exif_status: 'absent' })
    expect(result.suspicious).toBe(false)
    expect(result.flags.some((f) => f.level === 'warn')).toBe(true)
  })

  it('reports a geotag when present', () => {
    const result = evidenceIntegrity({ exif_status: 'present', gps_lat: 10.3, gps_lng: 123.9 })
    expect(result.hasGps).toBe(true)
    expect(result.flags.some((f) => f.level === 'ok' && /Geotagged/.test(f.text))).toBe(true)
  })

  it('alerts when the capture date falls outside the reporting period', () => {
    const result = evidenceIntegrity(
      { exif_status: 'present', captured_at: '2026-01-05T10:00:00Z' },
      [],
      report,
    )
    expect(result.suspicious).toBe(true)
    expect(result.flags.some((f) => /outside this reporting period/.test(f.text))).toBe(true)
  })

  it('accepts a capture date inside the period', () => {
    const result = evidenceIntegrity(
      { exif_status: 'present', captured_at: '2026-07-15T10:00:00Z' },
      [],
      report,
    )
    expect(result.suspicious).toBe(false)
  })

  it('alerts on a duplicate file', () => {
    const result = evidenceIntegrity({ exif_status: 'present' }, [{ id: 'x', report_id: 'r2' }])
    expect(result.suspicious).toBe(true)
    expect(result.flags.some((f) => f.level === 'alert' && /already submitted/.test(f.text))).toBe(true)
  })

  it('pluralises the duplicate count', () => {
    const one = evidenceIntegrity({}, [{ id: 'a' }])
    const many = evidenceIntegrity({}, [{ id: 'a' }, { id: 'b' }])
    expect(one.flags.some((f) => /1 other report\b/.test(f.text))).toBe(true)
    expect(many.flags.some((f) => /2 other reports/.test(f.text))).toBe(true)
  })
})
