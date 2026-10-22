import {
  Gauge,
  GitMerge,
  Headphones,
  LayoutGrid,
  LineChart,
  Map,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  section: 'main' | 'others'
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/dashboard', icon: LayoutGrid, section: 'main' },
  { label: 'Leads', path: '/leads', icon: User, section: 'main' },
  { label: 'Credit Reports', path: '/financial-assessments', icon: Gauge, section: 'main' },
  { label: 'Bank Analysis', path: '/customers', icon: LineChart, section: 'main' },
  { label: 'Cohort Engine', path: '/cohort-engine', icon: GitMerge, section: 'main' },
  { label: 'Recovery Plans', path: '/recovery-plans', icon: Map, section: 'main' },
  { label: 'Settings', path: '/settings', icon: Settings, section: 'others' },
  { label: 'Support', path: '/support', icon: Headphones, section: 'others' },
]
