import type { SyncResult, WatchResult, EmailDraft } from '@/types'

/**
 * EmailProvider — interface comum para todos os providers de email.
 * Toda a lógica de negócio (classificação, matching, drafts) usa APENAS este interface.
 * Nunca importar OutlookProvider / GmailProvider / ImapProvider directamente em serviços.
 */
export interface EmailProvider {
  /**
   * Sync incremental da inbox.
   * Outlook: usa delta queries com deltaLink.
   * Gmail: usa historyId para sync incremental.
   * IMAP: polling simples.
   */
  syncInbox(): Promise<SyncResult>

  /**
   * Descarrega o conteúdo de um attachment.
   * Retorna Buffer para upload para R2.
   */
  getAttachment(messageId: string, attachmentId: string): Promise<Buffer>

  /**
   * Envia uma resposta a um email.
   * Só chamado APÓS aprovação do contabilista — nunca directamente pelo AI.
   */
  sendReply(messageId: string, draft: EmailDraft): Promise<void>

  /**
   * Regista webhook para receber notificações de novos emails.
   * Outlook: Graph change notifications (subscription).
   * Gmail: Pub/Sub push notification.
   * IMAP: não suportado (polling only).
   */
  watchChanges(webhookUrl: string): Promise<WatchResult>
}
