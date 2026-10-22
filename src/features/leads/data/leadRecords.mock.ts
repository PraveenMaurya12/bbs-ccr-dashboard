import type { LeadFunnelStatus, LeadRecord } from '../types'

/**
 * The 10 rows shown in the Figma reference (node 1369:82823) and its
 * supplied screenshot, reproduced exactly (name, phone, credit score, PAN,
 * overdue amount, status, avatar) so the first page matches pixel-for-pixel.
 */
export const REFERENCE_LEAD_ROWS: LeadRecord[] = [
  /**
   * The ONE canonical rich E2E fixture lead. Every per-module analysis mock
   * (debtAnalysisService, financialAnalysisService, masterProfileService,
   * cohortEngineService, planEngineService) already keys its data-rich
   * fixture on the literal bbsLeadId 'BBS-LD-900001' — this row is what
   * makes that id resolvable from the base lead lookup too, so navigating
   * to /leads/BBS-LD-900001 (or the lead list row below) shows the full,
   * data-rich journey across every tab instead of a "Lead not found" error
   * or an empty-state tab. creditScore/totalOverdue are deliberately
   * consistent with the canonical bureau fixture (Experian score 748,
   * ₹0 CURRENT overdue despite a 27-day HISTORICAL max DPD and ₹946,114
   * total outstanding — current and historical delinquency are distinct).
   */
  {
    id: 'lead-canonical-001',
    bbsLeadId: 'BBS-LD-900001',
    dateTime: '2026-09-15T09:00:00.000Z',
    fullName: 'Rakesh Kulkarni',
    avatarIndex: 3,
    phone: '+91 9820012345',
    creditScore: 748,
    pan: 'ABCPK1234L',
    totalOverdue: 0,
    status: 'converted',
    source: 'website',
  },
  {
    id: 'lead-ref-01',
    dateTime: '2026-10-28T10:30:00.000Z',
    fullName: 'Devika Chopra',
    avatarIndex: 1,
    phone: '+91 8039563615',
    creditScore: 612,
    pan: 'YOCPV2739D',
    totalOverdue: 170345,
    status: 'new_lead',
    source: 'website',
  },
  {
    id: 'lead-ref-02',
    dateTime: '2026-10-27T10:30:00.000Z',
    fullName: 'Aayaushi Thaker',
    avatarIndex: 2,
    phone: '+91 9244029371',
    creditScore: 708,
    pan: 'HMLPB6586E',
    totalOverdue: 0,
    status: 'contacted',
    source: 'partner',
  },
  {
    id: 'lead-ref-03',
    dateTime: '2026-10-26T10:30:00.000Z',
    fullName: 'Iksha Chandran',
    avatarIndex: 3,
    phone: '+91 6616036653',
    creditScore: 534,
    pan: 'BOQPE2671J',
    totalOverdue: 344560,
    status: 'in_progress',
    source: 'website',
  },
  {
    id: 'lead-ref-04',
    dateTime: '2026-10-25T10:30:00.000Z',
    fullName: 'Aadvika Rajasekharuni',
    avatarIndex: 4,
    phone: '+91 7277584865',
    creditScore: 685,
    pan: 'AFZPX2956E',
    totalOverdue: 31450,
    status: 'contacted',
    source: 'partner',
  },
  {
    id: 'lead-ref-05',
    dateTime: '2026-10-24T10:30:00.000Z',
    fullName: 'Amay Nidagundi',
    avatarIndex: 5,
    phone: '+91 8446794471',
    creditScore: 482,
    pan: 'UUHPD5004K',
    totalOverdue: 586230,
    status: 'in_progress',
    source: 'website',
  },
  {
    id: 'lead-ref-06',
    dateTime: '2026-10-23T10:30:00.000Z',
    fullName: 'Gaurav Gunnikuntla',
    avatarIndex: 6,
    phone: '+91 8011094469',
    creditScore: 728,
    pan: 'ITWPM8958R',
    totalOverdue: 127890,
    status: 'converted',
    source: 'partner',
  },
  {
    id: 'lead-ref-07',
    dateTime: '2026-10-22T10:30:00.000Z',
    fullName: 'Natwar Tamboli',
    avatarIndex: 7,
    phone: '+91 9183322045',
    creditScore: 559,
    pan: 'RRWPU2882K',
    totalOverdue: 846370,
    status: 'new_lead',
    source: 'website',
  },
  {
    id: 'lead-ref-08',
    dateTime: '2026-10-21T10:30:00.000Z',
    fullName: 'Bharat Mishra',
    avatarIndex: 8,
    phone: '+91 9343519515',
    creditScore: 640,
    pan: 'QCDPL2309Y',
    totalOverdue: 39120,
    status: 'in_progress',
    source: 'partner',
  },
  {
    id: 'lead-ref-09',
    dateTime: '2026-10-20T10:30:00.000Z',
    fullName: 'Kanhaiya Swaraj',
    avatarIndex: 7,
    phone: '+91 8336883829',
    creditScore: 420,
    pan: 'APOPJ5669X',
    totalOverdue: 775720,
    status: 'not_eligible',
    source: 'website',
  },
  {
    id: 'lead-ref-10',
    dateTime: '2026-10-19T10:30:00.000Z',
    fullName: 'Amrusha Honnalli',
    avatarIndex: 9,
    phone: '+91 6859109739',
    creditScore: 470,
    pan: 'OEBPJ6647Z',
    totalOverdue: 223410,
    status: 'new_lead',
    source: 'partner',
  },
]

const FIRST_NAMES = [
  'Ananya', 'Rohit', 'Farah', 'Karthik', 'Meera', 'Devansh', 'Priya', 'Vikram',
  'Sneha', 'Arjun', 'Kavya', 'Rahul', 'Isha', 'Aditya', 'Neha', 'Manish',
  'Divya', 'Suresh', 'Pooja', 'Rajesh', 'Latha', 'Vivek', 'Shreya', 'Nikhil',
]
const LAST_NAMES = [
  'Rao', 'Malhotra', 'Sheikh', 'Subramaniam', 'Pillai', 'Gupta', 'Nair', 'Shah',
  'Iyer', 'Kapoor', 'Reddy', 'Verma', 'Menon', 'Joshi', 'Bhatt', 'Chauhan',
]
const STATUS_CYCLE: LeadFunnelStatus[] = [
  'new_lead', 'contacted', 'in_progress', 'contacted', 'in_progress',
  'converted', 'new_lead', 'in_progress', 'not_eligible', 'new_lead',
]

function generateAdditionalRows(count: number, startIndex: number): LeadRecord[] {
  const rows: LeadRecord[] = []
  const baseDate = new Date('2026-10-19T10:30:00.000Z')

  for (let i = 0; i < count; i++) {
    const seed = startIndex + i
    const first = FIRST_NAMES[seed % FIRST_NAMES.length]!
    const last = LAST_NAMES[(seed * 7) % LAST_NAMES.length]!
    const status = STATUS_CYCLE[seed % STATUS_CYCLE.length]!
    const creditScore = 350 + ((seed * 37) % 500)
    const date = new Date(baseDate)
    date.setDate(date.getDate() - (seed + 1))

    rows.push({
      id: `lead-gen-${seed}`,
      dateTime: date.toISOString(),
      fullName: `${first} ${last}`,
      avatarIndex: (seed % 9) + 1,
      phone: `+91 ${String(6000000000 + ((seed * 99173) % 3999999999)).padStart(10, '0')}`,
      creditScore,
      pan: `${String.fromCharCode(65 + (seed % 26))}${String.fromCharCode(65 + ((seed * 3) % 26))}${String.fromCharCode(65 + ((seed * 5) % 26))}${String.fromCharCode(80)}${String((seed * 1234) % 10000).padStart(4, '0')}${String.fromCharCode(65 + ((seed * 11) % 26))}`,
      totalOverdue: status === 'converted' || status === 'contacted' ? (seed * 53) % 40000 : 20000 + ((seed * 4127) % 900000),
      status,
      source: seed % 2 === 0 ? 'website' : 'partner',
    })
  }

  return rows
}

/**
 * Figma's stat card says "TOTAL LEADS 245" while its own pagination footer
 * says "of 57 entries" — the two numbers in the source design contradict
 * each other (a static-mock artifact, not a real dataset). Since pagination
 * and the stats row must both be functional and read from the same
 * underlying list, one number has to be picked as ground truth: 245, the
 * more prominent headline figure.
 */
export const TARGET_TOTAL_LEADS = 245

export const mockLeadRecords: LeadRecord[] = [
  ...REFERENCE_LEAD_ROWS,
  ...generateAdditionalRows(TARGET_TOTAL_LEADS - REFERENCE_LEAD_ROWS.length, REFERENCE_LEAD_ROWS.length),
]
