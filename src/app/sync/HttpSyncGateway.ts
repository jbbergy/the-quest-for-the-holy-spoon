import { ApiClient } from '@/contract/apiClient'
import {
  type OutgoingChange,
  pullResponseSchema,
  pushResponseSchema,
  SYNC_ROUTE,
} from '@/contract/sync'
import { map } from '@/core/result'

import type { ISyncGateway } from './ports'

export class HttpSyncGateway implements ISyncGateway {
  constructor(private readonly api: ApiClient = new ApiClient()) {}

  async push(changes: readonly OutgoingChange[]) {
    const response = await this.api.request('POST', SYNC_ROUTE.push, pushResponseSchema, {
      changes,
    })
    return map(response, (body) => body.rejected)
  }

  pull(since: number) {
    return this.api.request('GET', `${SYNC_ROUTE.pull}?since=${since}`, pullResponseSchema)
  }
}
