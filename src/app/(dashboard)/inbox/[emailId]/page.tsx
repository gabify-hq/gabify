import { notFound } from 'next/navigation'
import { EmailDetail } from '@/components/dashboard/email-detail'
import { getEmailById, getActionByEmailId } from '@/lib/mock-data'

interface EmailPageProps {
  params: Promise<{ emailId: string }>
}

export default async function EmailPage({ params }: EmailPageProps) {
  const { emailId } = await params
  const email = getEmailById(emailId)

  if (!email) notFound()

  const action = getActionByEmailId(emailId)

  return <EmailDetail email={email} action={action} />
}
