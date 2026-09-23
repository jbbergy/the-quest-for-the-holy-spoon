import { createHash, randomBytes } from 'node:crypto'

/**
 * Jeton aléatoire (session, lien d'e-mail). Seule son empreinte SHA-256 est
 * stockée : le jeton clair n'existe que dans le cookie ou le lien. Un SHA-256
 * suffit ici — contrairement à un mot de passe, 256 bits aléatoires ne se
 * devinent pas par force brute.
 */
export function newToken(): { readonly token: string; readonly hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
