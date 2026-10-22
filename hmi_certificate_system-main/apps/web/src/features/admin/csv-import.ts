export type ParticipantImportRow = { name: string; email: string; ok: boolean }
export type CsvImportProgress = { bytesRead: number; totalBytes: number; rowsParsed: number }

const MAX_PARTICIPANTS = 20_000
const YIELD_EVERY_ROWS = 400

/** Parse a CSV stream without building a second full-file string or blocking the UI for the whole import. */
export async function parseParticipantCsv(
  file: File,
  onProgress: (progress: CsvImportProgress) => void,
): Promise<ParticipantImportRow[]> {
  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  const participants: ParticipantImportRow[] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let pendingQuotedQuote = false
  let skipLeadingLineFeed = false
  let header: string[] | null = null
  let nameColumn = 0
  let emailColumn = 1
  let bytesRead = 0
  let processedSinceYield = 0
  let charactersSinceYield = 0

  const commitRecord = () => {
    record.push(field.trim())
    field = ''
    if (!header) {
      header = record.map((cell) => cell.trim().replace(/^\uFEFF/, '').toLowerCase())
      const nameHeader = header.findIndex((cell) => ['name', 'full name', 'participant name'].includes(cell))
      const emailHeader = header.findIndex((cell) => ['email', 'email address'].includes(cell))
      if (nameHeader < 0 || emailHeader < 0) {
        throw new Error('CSV needs Name and Email columns in its first row.')
      }
      nameColumn = nameHeader
      emailColumn = emailHeader
    } else if (record.some((cell) => cell.length > 0)) {
      const name = record[nameColumn] ?? ''
      const email = record[emailColumn] ?? ''
      participants.push({ name, email, ok: Boolean(name.trim()) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) })
      if (participants.length > MAX_PARTICIPANTS) {
        throw new Error(`This file contains more than ${MAX_PARTICIPANTS.toLocaleString()} participants. Split it into smaller files and try again.`)
      }
      processedSinceYield++
    }
    record = []
  }

  const consume = async (text: string, finalChunk = false) => {
    for (let index = 0; index < text.length; index++) {
      charactersSinceYield++
      if (charactersSinceYield >= 32_768) {
        charactersSinceYield = 0
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
      const char = text[index]
      if (skipLeadingLineFeed) {
        skipLeadingLineFeed = false
        if (char === '\n') continue
      }
      if (pendingQuotedQuote) {
        pendingQuotedQuote = false
        if (char === '"') {
          field += '"'
          continue
        }
        inQuotes = false
      }
      if (inQuotes) {
        if (char === '"') {
          if (index + 1 === text.length) {
            pendingQuotedQuote = true
          } else if (text[index + 1] === '"') {
            field += '"'
            index++
          } else {
            inQuotes = false
          }
        } else {
          field += char
        }
      } else if (char === '"' && field.length === 0) {
        inQuotes = true
      } else if (char === ',') {
        record.push(field.trim())
        field = ''
      } else if (char === '\n' || char === '\r') {
        commitRecord()
        if (char === '\r') skipLeadingLineFeed = true
      } else {
        field += char
      }

      if (processedSinceYield >= YIELD_EVERY_ROWS) {
        processedSinceYield = 0
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
    }
    if (finalChunk && pendingQuotedQuote) {
      pendingQuotedQuote = false
      inQuotes = false
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      await consume(decoder.decode(value, { stream: true }))
      onProgress({ bytesRead, totalBytes: file.size, rowsParsed: participants.length })
    }
    await consume(decoder.decode(), true)
    if (inQuotes) throw new Error('The CSV has an unclosed quoted field. Check the file and try again.')
    if (field.length || record.length) commitRecord()
    if (!header) throw new Error('The CSV file is empty or has no header row.')
    if (participants.length === 0) throw new Error('No participant rows were found in this CSV.')
    onProgress({ bytesRead: file.size, totalBytes: file.size, rowsParsed: participants.length })
    return participants
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}
