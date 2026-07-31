/**
 * Evidence integrity helpers — EXIF extraction and content hashing.
 *
 * Supports the verifier's fraud checks (role-needs #8): when was this photo
 * taken, where, and has it been submitted before?
 *
 * A minimal EXIF reader rather than a dependency: only two facts are needed
 * (DateTimeOriginal and GPS), the JPEG/TIFF layout for them is fixed and
 * well-specified, and this repo already prefers small local utilities over
 * packages for things like CSV serialization.
 *
 * Everything here is pure and synchronous except the hash, which uses
 * SubtleCrypto. Nothing throws on malformed input — a photo that cannot be
 * parsed reports 'unreadable', which is a fact the verifier should see rather
 * than an error that loses the upload.
 */

/** EXIF tag ids we care about. */
const TAG_EXIF_IFD = 0x8769
const TAG_GPS_IFD = 0x8825
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME_DIGITIZED = 0x9004
const TAG_GPS_LAT_REF = 0x0001
const TAG_GPS_LAT = 0x0002
const TAG_GPS_LNG_REF = 0x0003
const TAG_GPS_LNG = 0x0004

/** Bytes per EXIF value type, indexed by type id. */
const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }

/** Decode a base64 data URL into raw bytes. Returns null if it isn't one. */
export function dataUrlToBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma === -1) return null
  if (!/;base64/i.test(dataUrl.slice(0, comma))) return null
  try {
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/**
 * SHA-256 of the given bytes, lowercase hex.
 * Returns null where SubtleCrypto is unavailable (non-secure context, old
 * browser) — integrity data is a bonus, never a reason to block an upload.
 */
export async function sha256Hex(bytes) {
  if (!bytes || !bytes.length) return null
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  try {
    const digest = await subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

/** Locate the TIFF header inside a JPEG's APP1 segment. Null if absent. */
function findExifTiffStart(bytes) {
  // SOI
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null // not on a marker boundary
    const marker = bytes[offset + 1]
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    // Start of scan — image data follows, no more metadata worth walking.
    if (marker === 0xda || marker === 0xd9) return null

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2) return null

    if (marker === 0xe1) {
      const header = offset + 4
      // "Exif\0\0"
      if (
        bytes[header] === 0x45 &&
        bytes[header + 1] === 0x78 &&
        bytes[header + 2] === 0x69 &&
        bytes[header + 3] === 0x66 &&
        bytes[header + 4] === 0x00
      ) {
        return header + 6
      }
    }
    offset += 2 + length
  }
  return null
}

/** Minimal reader over the TIFF block, honouring its byte order. */
function tiffReader(bytes, tiffStart) {
  const b0 = bytes[tiffStart]
  const b1 = bytes[tiffStart + 1]
  let little
  if (b0 === 0x49 && b1 === 0x49) little = true
  else if (b0 === 0x4d && b1 === 0x4d) little = false
  else return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (abs) => (abs + 2 <= bytes.length ? view.getUint16(abs, little) : 0)
  const u32 = (abs) => (abs + 4 <= bytes.length ? view.getUint32(abs, little) : 0)

  if (u16(tiffStart + 2) !== 0x002a) return null
  return { little, u16, u32, tiffStart }
}

/**
 * Read one IFD into a map of tag → { type, count, valueOffset }.
 * All offsets in EXIF are relative to the TIFF header start.
 */
function readIfd(r, bytes, ifdOffset) {
  const entries = new Map()
  const base = r.tiffStart + ifdOffset
  const count = r.u16(base)
  // A corrupt count could otherwise walk far past the buffer.
  if (!count || count > 1024) return entries

  for (let i = 0; i < count; i += 1) {
    const entry = base + 2 + i * 12
    if (entry + 12 > bytes.length) break
    const tag = r.u16(entry)
    const type = r.u16(entry + 2)
    const num = r.u32(entry + 4)
    const size = (TYPE_SIZES[type] || 0) * num
    // Values of 4 bytes or fewer live inline; larger ones are referenced.
    const valueOffset = size > 4 ? r.tiffStart + r.u32(entry + 8) : entry + 8
    entries.set(tag, { type, count: num, valueOffset, size })
  }
  return entries
}

function readAscii(bytes, entry) {
  if (!entry || entry.type !== 2) return null
  const end = Math.min(entry.valueOffset + entry.count, bytes.length)
  let out = ''
  for (let i = entry.valueOffset; i < end; i += 1) {
    const c = bytes[i]
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out || null
}

/** RATIONAL triplet (degrees, minutes, seconds) → decimal degrees. */
function readGpsCoordinate(r, entry) {
  if (!entry || entry.type !== 5 || entry.count < 3) return null
  let degrees = 0
  for (let i = 0; i < 3; i += 1) {
    const at = entry.valueOffset + i * 8
    const numerator = r.u32(at)
    const denominator = r.u32(at + 4)
    if (!denominator) return null
    degrees += numerator / denominator / 60 ** i
  }
  return degrees
}

/** "YYYY:MM:DD HH:MM:SS" → ISO string, or null if unparseable. */
export function exifDateToIso(value) {
  if (typeof value !== 'string') return null
  const m = value.trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  if (isNaN(date.getTime())) return null
  // EXIF carries no timezone; treating it as UTC keeps it stable and
  // comparable rather than silently shifting with the reviewer's locale.
  return date.toISOString()
}

/**
 * Extract the capture metadata a verifier needs from JPEG bytes.
 *
 * @param {Uint8Array} bytes
 * @returns {{status:'present'|'absent'|'unreadable', capturedAt:string|null,
 *            latitude:number|null, longitude:number|null}}
 */
export function extractExif(bytes) {
  const none = { status: 'absent', capturedAt: null, latitude: null, longitude: null }
  if (!bytes || bytes.length < 4) return { ...none, status: 'unreadable' }

  let tiffStart
  try {
    tiffStart = findExifTiffStart(bytes)
  } catch {
    return { ...none, status: 'unreadable' }
  }
  if (tiffStart === null) return none

  try {
    const r = tiffReader(bytes, tiffStart)
    if (!r) return { ...none, status: 'unreadable' }

    const ifd0 = readIfd(r, bytes, r.u32(tiffStart + 4))

    let capturedAt = null
    const exifPointer = ifd0.get(TAG_EXIF_IFD)
    if (exifPointer) {
      const exifIfd = readIfd(r, bytes, r.u32(exifPointer.valueOffset))
      capturedAt =
        exifDateToIso(readAscii(bytes, exifIfd.get(TAG_DATETIME_ORIGINAL))) ||
        exifDateToIso(readAscii(bytes, exifIfd.get(TAG_DATETIME_DIGITIZED)))
    }

    let latitude = null
    let longitude = null
    const gpsPointer = ifd0.get(TAG_GPS_IFD)
    if (gpsPointer) {
      const gpsIfd = readIfd(r, bytes, r.u32(gpsPointer.valueOffset))
      const lat = readGpsCoordinate(r, gpsIfd.get(TAG_GPS_LAT))
      const lng = readGpsCoordinate(r, gpsIfd.get(TAG_GPS_LNG))
      const latRef = readAscii(bytes, gpsIfd.get(TAG_GPS_LAT_REF))
      const lngRef = readAscii(bytes, gpsIfd.get(TAG_GPS_LNG_REF))
      if (lat != null) latitude = /^S/i.test(latRef || '') ? -lat : lat
      if (lng != null) longitude = /^W/i.test(lngRef || '') ? -lng : lng
    }

    const found = capturedAt != null || latitude != null || longitude != null
    return { status: found ? 'present' : 'absent', capturedAt, latitude, longitude }
  } catch {
    return { ...none, status: 'unreadable' }
  }
}

/**
 * Everything worth recording about an evidence file at upload time.
 *
 * @param {string} dataUrl - the base64 data URL the file was read into
 * @returns {Promise<{content_hash:string|null, captured_at:string|null,
 *                    gps_lat:number|null, gps_lng:number|null, exif_status:string}>}
 */
export async function analyseEvidence(dataUrl) {
  const bytes = dataUrlToBytes(dataUrl)
  if (!bytes) {
    return {
      content_hash: null,
      captured_at: null,
      gps_lat: null,
      gps_lng: null,
      exif_status: 'unreadable',
    }
  }
  const exif = extractExif(bytes)
  return {
    content_hash: await sha256Hex(bytes),
    captured_at: exif.capturedAt,
    gps_lat: exif.latitude,
    gps_lng: exif.longitude,
    exif_status: exif.status,
  }
}

/**
 * Turn stored evidence metadata into the flags a verifier reads.
 *
 * Pure — exported for unit testing. Note that missing EXIF is reported as an
 * absence to weigh, never as an accusation: messaging apps, screenshots and
 * privacy settings strip it routinely.
 *
 * @param {Object} evidence - a monitoring_evidence row
 * @param {Array<Object>} [duplicates] - other evidence rows sharing its hash
 * @param {Object} [report] - the report, for period comparison
 */
export function evidenceIntegrity(evidence, duplicates = [], report = null) {
  const flags = []
  const status = evidence?.exif_status || null

  if (status === null) {
    flags.push({ level: 'info', text: 'Uploaded before integrity checks — not analysed' })
  } else if (status === 'absent') {
    flags.push({ level: 'warn', text: 'No capture metadata (EXIF stripped or not recorded)' })
  } else if (status === 'unreadable') {
    flags.push({ level: 'warn', text: 'Capture metadata could not be read' })
  }

  const hasGps = evidence?.gps_lat != null && evidence?.gps_lng != null
  if (hasGps) {
    flags.push({
      level: 'ok',
      text: `Geotagged ${Number(evidence.gps_lat).toFixed(5)}, ${Number(evidence.gps_lng).toFixed(5)}`,
    })
  } else if (status === 'present') {
    flags.push({ level: 'warn', text: 'No GPS coordinates in the photo' })
  }

  if (evidence?.captured_at) {
    flags.push({ level: 'ok', text: `Captured ${new Date(evidence.captured_at).toLocaleString()}` })

    // A photo taken outside the period it evidences is the single most useful
    // thing this check can surface.
    const start = report?.period_start ? new Date(report.period_start) : null
    const end = report?.period_end ? new Date(report.period_end) : null
    const taken = new Date(evidence.captured_at)
    if ((start && taken < start) || (end && taken > new Date(end.getTime() + 86400000))) {
      flags.push({ level: 'alert', text: 'Captured outside this reporting period' })
    }
  }

  if (duplicates?.length) {
    flags.push({
      level: 'alert',
      text: `Identical file already submitted (${duplicates.length} other report${duplicates.length > 1 ? 's' : ''})`,
    })
  }

  return {
    flags,
    hasGps,
    // Anything a verifier should look at before approving.
    suspicious: flags.some((f) => f.level === 'alert'),
  }
}
