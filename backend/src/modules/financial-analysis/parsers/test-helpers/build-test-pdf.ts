/**
 * Builds a real, minimal, valid single-page PDF (PDF 1.4, one Helvetica
 * text stream, correct xref byte offsets) containing the given lines as
 * plain positioned text — used only by this module's own parser tests, so
 * `parsePdfStatement()` is exercised against genuine PDF bytes rather than
 * a mocked/stubbed parser. Deliberately produces NO real table geometry,
 * so these tests exercise the heuristic text-line fallback path, which is
 * the one this module's v1 PDF support actually relies on most.
 */
export function buildTestPdf(lines: string[]): Buffer {
  function escapePdfText(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  }

  const contentLines = lines
    .map((line, i) => `${i === 0 ? '50 750 Td' : '0 -14 Td'} (${escapePdfText(line)}) Tj`)
    .join('\n')
  const contentStream = `BT /F1 10 Tf\n${contentLines}\nET`

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'latin1')} >>\nstream\n${contentStream}\nendstream`,
  ]

  const header = '%PDF-1.4\n'
  let body = ''
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(header.length + body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })

  const xrefOffset = header.length + body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(header + body + xref + trailer, 'latin1')
}
