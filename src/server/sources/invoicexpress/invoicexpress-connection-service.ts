import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/crypto'
import type { InvoicexpressConnection } from '@prisma/client'
import type { SourceConnectionDTO } from '../source-connection-dto'

/**
 * InvoiceXpress source-connection lifecycle (per END-CLIENT). The api_key is
 * AES-256-GCM encrypted before persistence and NEVER leaves the server (it also
 * travels in the API query string, so it is never logged). The DTO is built
 * field-by-field. Doc-driven, NEVER validated against the real API.
 */

async function importedCountFor(clientId: string): Promise<number> {
  return prisma.sourceEntityMap.count({
    where: { clientId, system: 'INVOICEXPRESS', entityType: 'SALES_DOCUMENT' },
  })
}

export async function toInvoicexpressDTO(
  connection: InvoicexpressConnection,
): Promise<SourceConnectionDTO> {
  return {
    system: 'INVOICEXPRESS',
    clientId: connection.clientId,
    status: connection.status,
    pullEnabled: connection.pullEnabled,
    lastPullAt: connection.lastPullAt ? connection.lastPullAt.toISOString() : null,
    lastError: connection.lastError,
    hasCredentials: Boolean(connection.apiKey),
    importedCount: await importedCountFor(connection.clientId),
    updatedAt: connection.updatedAt.toISOString(),
    accountName: connection.accountName,
  }
}

export async function getInvoicexpressConnection(
  officeId: string,
  clientId: string,
): Promise<SourceConnectionDTO | null> {
  const connection = await prisma.invoicexpressConnection.findFirst({
    where: { officeId, clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  return connection ? toInvoicexpressDTO(connection) : null
}

export async function saveInvoicexpressConnection(params: {
  officeId: string
  clientId: string
  accountName: string
  apiKey: string
  userId: string
}): Promise<SourceConnectionDTO> {
  const base = { accountName: params.accountName, apiKey: encryptToken(params.apiKey) }
  const existing = await prisma.invoicexpressConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  const connection = existing
    ? await prisma.invoicexpressConnection.update({
        where: { id: existing.id },
        data: { ...base, status: 'ATIVA', lastError: null },
      })
    : await prisma.invoicexpressConnection.create({
        data: { officeId: params.officeId, clientId: params.clientId, ...base, status: 'ATIVA' },
      })

  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'INVOICEXPRESS_CONNECTION_SAVED',
      entityType: 'InvoicexpressConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId, accountName: params.accountName },
    },
  })
  return toInvoicexpressDTO(connection)
}

export async function setInvoicexpressPullEnabled(params: {
  officeId: string
  clientId: string
  pullEnabled: boolean
  userId: string
}): Promise<SourceConnectionDTO | null> {
  const connection = await prisma.invoicexpressConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (!connection) return null
  const updated = await prisma.invoicexpressConnection.update({
    where: { id: connection.id },
    data: { pullEnabled: params.pullEnabled },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'INVOICEXPRESS_PULL_TOGGLED',
      entityType: 'InvoicexpressConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId, pullEnabled: params.pullEnabled },
    },
  })
  return toInvoicexpressDTO(updated)
}

export async function disableInvoicexpressConnection(params: {
  officeId: string
  clientId: string
  userId: string
}): Promise<SourceConnectionDTO | null> {
  const connection = await prisma.invoicexpressConnection.findFirst({
    where: { officeId: params.officeId, clientId: params.clientId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  })
  if (!connection) return null
  const updated = await prisma.invoicexpressConnection.update({
    where: { id: connection.id },
    data: { status: 'DESLIGADA', pullEnabled: false },
  })
  await prisma.auditLog.create({
    data: {
      officeId: params.officeId,
      userId: params.userId,
      action: 'INVOICEXPRESS_CONNECTION_DISABLED',
      entityType: 'InvoicexpressConnection',
      entityId: connection.id,
      metadata: { clientId: params.clientId },
    },
  })
  return toInvoicexpressDTO(updated)
}
