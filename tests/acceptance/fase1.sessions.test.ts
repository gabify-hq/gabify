import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { truncateAll, prisma } from '../helpers/db'
import { makeOffice, makeUser } from '../helpers/factories'
import { GabifyAdapter } from '@/lib/auth-adapter'
import { enrichSession } from '@/lib/auth-session'

const adapter = () => GabifyAdapter(prisma)

describe('AC-1.2 Sessões database (§1.2)', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('AC-1.2.a [INV] — mudança de role na BD reflete-se no request seguinte sem re-login', async () => {
    const office = await makeOffice()
    const user = await makeUser({ officeId: office.id, role: 'ACCOUNTANT' })

    const expires = new Date(Date.now() + 24 * 3600 * 1000)
    await adapter().createSession!({ sessionToken: 'tok-1', userId: user.id, expires })

    // First request: role read fresh from the DB via the session lookup
    const first = await adapter().getSessionAndUser!('tok-1')
    expect(first).not.toBeNull()
    const s1 = enrichSession(
      { user: { email: user.email }, expires: expires.toISOString() },
      first!.user as unknown as Parameters<typeof enrichSession>[1]
    )
    expect(s1.user.role).toBe('ACCOUNTANT')
    expect(s1.user.officeId).toBe(office.id)

    // Role changes in the DB — next request must already see VIEWER
    await prisma.user.update({ where: { id: user.id }, data: { role: 'VIEWER' } })

    const second = await adapter().getSessionAndUser!('tok-1')
    const s2 = enrichSession(
      { user: { email: user.email }, expires: expires.toISOString() },
      second!.user as unknown as Parameters<typeof enrichSession>[1]
    )
    expect(s2.user.role).toBe('VIEWER')
  })

  it('AC-1.2.b [INV] — sessão apagada na BD → request seguinte não autenticada', async () => {
    const office = await makeOffice()
    const user = await makeUser({ officeId: office.id })
    const expires = new Date(Date.now() + 24 * 3600 * 1000)
    await adapter().createSession!({ sessionToken: 'tok-2', userId: user.id, expires })

    expect(await adapter().getSessionAndUser!('tok-2')).not.toBeNull()

    await prisma.session.deleteMany({ where: { sessionToken: 'tok-2' } })

    expect(await adapter().getSessionAndUser!('tok-2')).toBeNull()
  })

  it('AC-1.2.c — grep-gate: strategy jwt ausente de src/, strategy database presente', () => {
    const srcDir = join(process.cwd(), 'src')
    let jwtFound = false
    let databaseFound = false

    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue
        const content = readFileSync(full, 'utf-8')
        if (/strategy:\s*['"]jwt['"]/.test(content)) jwtFound = true
        if (/strategy:\s*['"]database['"]/.test(content)) databaseFound = true
      }
    }
    walk(srcDir)

    expect(jwtFound).toBe(false)
    expect(databaseFound).toBe(true)
  })
})
