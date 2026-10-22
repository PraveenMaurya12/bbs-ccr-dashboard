import { delay } from './mock/delay'
import { mockCustomers } from './mock/customers.mock'
import type { Customer } from '@/types'

export interface CustomerService {
  listCustomers(): Promise<Customer[]>
  getCustomerByLeadId(leadId: string): Promise<Customer | null>
}

class MockCustomerService implements CustomerService {
  async listCustomers(): Promise<Customer[]> {
    return delay([...mockCustomers])
  }

  async getCustomerByLeadId(leadId: string): Promise<Customer | null> {
    const customer = mockCustomers.find((c) => c.leadId === leadId) ?? null
    return delay(customer)
  }
}

export const customerService: CustomerService = new MockCustomerService()
