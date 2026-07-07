import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/crypto'
import type { MoloniConnection } from '@prisma/client'
import type { SourceConnectionDTO } from '../source-connection-dto'

/**
 * Moloni source-connection lifecycle (per END-CLIENT — the Moloni account
 * belongs to the client company). Username/password are AES-256-GCM encrypted
 * before persistence and NEVER leave the server; the DTO is built field-by-field
 * so nothing secret can leak. Doc-driven, NEVER validated against the real API.
 */

async function importedCountFor(clientId: string): Promise<number> {
  return prisma.sourceEntityMap.count({
    where: { clientId, system: 'MOLONI', entityType: 'SALES_DOCUMENT' },
  })
}

export async function toMoloniDTO(connection: MoloniConnection): Promise<SourceConnectionDTO> {
  return {
    system: 'MOLONI',
    clientId: connection.clientId,
    status: connection.status,
    pullEnabled: connection.pullEnabled,
    lastPullAt: connection.lastPullAt ? connection.lastPullAt.toISOString() : null,
    lastError: connection.lastError,
    hasCredentials: Boolean(connection.username),
    importedCount: await importedCountFor(connection.clientId),
    updatedAt: connection.updatedAt.toISOString(),
    companyId: connection.companyId,
    companyName: connection.companyName || undefined,
  }
}

export async function getMoloniConnection(
  officeId: string,
  clientId: string,
): Promise<SourceConnectionDTO | null> {
  const connection = await prisma.moloniConnection.findFirst({
    where: { officeId, clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  return connection ? toMoloniDTO(connection) : null
}

export async function saveMoloniConnection(params: {
  officeId: string
  clientId: string
  companyId: number
  companyName: string
  username: string
  password: string
  userId: string
}): Promise<SourceConnectionDTO> {
  const base = {
    companyId: params.companyId,
    companyName: params.companyName,
    username: encryptToken(params.username),
    password: encryptToken(params.password),
  }
  const existing = await prisma.moloniConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const connection = existing
    ? await prisma.moloniConnection.update({
        where: { id: existing.id },
        data: {
          ...base,
          // fresh credentials invalidate stored tokens
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          status: 'ATIVA',
          lastError: null,
        },
      })
    : await prisma.moloniConnection.create({
        data: { officeId: params.officeId, clientId: params.clientId, ...base, status: 'ATIVA' },
      })

  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'MOLONI_CONNECTION_SAVED',
      entityType: 'MoloniConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId, companyId: params.companyId },
    },
  })
  return toMoloniDTO(connection)
}

export async function setMoloniPullEnabled(params: {
  officeId: string
  clientId: string
  pullEnabled: boolean
  userId: string
}): Promise<SourceConnectionDTO | null> {
  const connection = await prisma.moloniConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (!connection) return null
  const updated = await prisma.moloniConnection.update({
    where: { id: connection.id },
    data: { pullEnabled: params.pullEnabled },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'MOLONI_PULL_TOGGLED',
      entityType: 'MoloniConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId, pullEnabled: params.pullEnabled },
    },
  })
  return toMoloniDTO(updated)
}

export async function disableMoloniConnection(params: {
  officeId: string
  clientId: string
  userId: string
}): Promise<SourceConnectionDTO | null> {
  const connection = await prisma.moloniConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (!connection) return null
  const updated = await prisma.moloniConnection.update({
    where: { id: connection.id },
    data: {
      status: 'DESLIGADA',
      pullEnabled: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'MOLONI_CONNECTION_DISABLED',
      entityType: 'MoloniConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId },
    },
  })
  return toMoloniDTO(updated)
}
