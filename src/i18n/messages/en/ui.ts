import type { Messages } from '../schema'
import type { ui as fr } from '../fr/ui'

export const ui: Messages<typeof fr> = {
  required: '(required)',
  cancel: 'Cancel',
  infoTip: 'Explanation: {term}',
  source: {
    ciqual: 'Public catalogue',
    openFoodFacts: 'Brand product',
    user: 'My food',
    addedBy: 'Added by {author}',
  },
  consumed: {
    label: 'Eaten',
    at: 'at {time}',
    not: 'Not eaten yet',
  },
  password: {
    show: 'Show',
    hide: 'Hide',
    theField: 'the password',
  },
  gauge: {
    limitExceeded: 'Over the limit by {rest}',
    underLimit: 'Under the limit',
    floorReached: 'Minimum reached',
    remaining: '{rest} to go',
    targetReached: 'Target reached',
    overTarget: '{rest} over the target',
    limitOf: 'limit {bound}',
    atLeast: 'at least {bound}',
    outOf: 'of {bound}',
    average: 'Average: {value} {unit}',
    averageSpoken: 'Average over the last 7 days: {value} {unit}',
    spoken: '{label}: {value} {unit}, {reference}. {status}.',
  },
}
