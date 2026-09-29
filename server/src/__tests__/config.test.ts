import { describe, expect, it } from 'vitest'

import { configFromEnv } from '../shared/config'

const PRODUCTION = {
  NODE_ENV: 'production',
  APP_URL: 'https://holyspoon.jibhey.fr',
  DATABASE_URL: 'postgres://user:password@postgres:5432/db',
}

const SMTP = {
  SMTP_HOST: 'smtp-relay.brevo.com',
  SMTP_USER: 'user@smtp-brevo.com',
  SMTP_PASSWORD: 'secret',
  MAIL_FROM: 'Holy Spoon <holyspoon@jibhey.fr>',
}

describe('Configuration SMTP', () => {
  it('reste sur la console en développement', () => {
    expect(configFromEnv({}).smtp).toBeUndefined()
  })

  it('exige un relais en production', () => {
    expect(() => configFromEnv(PRODUCTION)).toThrow('SMTP_HOST')
  })

  it('lit le relais, sur le port 587 par défaut', () => {
    expect(configFromEnv({ ...PRODUCTION, ...SMTP }).smtp).toEqual({
      host: 'smtp-relay.brevo.com',
      port: 587,
      user: 'user@smtp-brevo.com',
      password: 'secret',
      from: 'Holy Spoon <holyspoon@jibhey.fr>',
    })
  })

  it('refuse un relais incomplet', () => {
    expect(() => configFromEnv({ ...PRODUCTION, ...SMTP, SMTP_PASSWORD: undefined })).toThrow(
      'SMTP_PASSWORD',
    )
  })
})
