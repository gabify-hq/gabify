import type { EmailAccount } from '@prisma/client'
import type { EmailProvider } from './EmailProvider'
import { OutlookProvider } from './OutlookProvider'
import { GmailProvider } from './GmailProvider'
import { ImapProvider } from './ImapProvider'

export type { EmailProvider }
export { OutlookProvider, GmailProvider, ImapProvider }

/**
 * Factory — única função que brancha por provider.
 * Toda a lógica de negócio deve usar o interface EmailProvider,
 * nunca instanciar providers directamente.
 */
export function createEmailProvider(account: EmailAccount): EmailProvider {
  switch (account.provider) {
    case 'OUTLOOK':
      return new OutlookProvider(account)
    case 'GMAIL':
      return new GmailProvider(account)
    case 'IMAP':
      return new ImapProvider(account)
    default:
      throw new Error(`Unknown email provider: ${account.provider}`)
  }
}
