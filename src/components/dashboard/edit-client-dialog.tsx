'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditClientDialogProps {
  client: {
    id: string
    name: string
    nif: string | null
    email: string | null
    emailDomains: string[]
    knownEmails: string[]
    notes: string | null
  }
}

interface FormErrors {
  name?: string[]
  nif?: string[]
  email?: string[]
  knownEmails?: string[]
  general?: string
}

interface TagInputProps {
  id: string
  label: string
  hint: string
  placeholder: string
  tags: string[]
  onAdd: (value: string) => void
  onRemove: (index: number) => void
  error?: string
}

function TagInput({ id, label, hint, placeholder, tags, onAdd, onRemove, error }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  function handleAdd() {
    const v = inputValue.trim().toLowerCase()
    if (v && !tags.includes(v)) {
      onAdd(v)
      setInputValue('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-slate-700">
        {label}
      </label>
      <p className="mb-1.5 text-[11px] text-gray-400">{hint}</p>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Adicionar"
        >
          <Plus className="h-4 w-4 stroke-[1.75]" />
        </button>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 ring-1 ring-green-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="cursor-pointer text-green-500 hover:text-green-700"
                aria-label={`Remover ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && (
        <p className="mt-1 text-[11px] text-red-600" role="alert">{error}</p>
      )}
    </div>
  )
}

export function EditClientDialog({ client }: EditClientDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errors, setErrors] = useState<FormErrors>({})
  const [emailDomains, setEmailDomains] = useState<string[]>(client.emailDomains)
  const [knownEmails, setKnownEmails] = useState<string[]>(client.knownEmails)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Reset form to current client values every time dialog opens
  useEffect(() => {
    if (open) {
      setEmailDomains(client.emailDomains)
      setKnownEmails(client.knownEmails)
      setErrors({})
      setTimeout(() => firstInputRef.current?.focus(), 50)
    }
  }, [open, client.emailDomains, client.knownEmails])

  function closeDialog() {
    if (isPending) return
    setOpen(false)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    const payload = {
      name: (form.get('name') as string).trim(),
      nif: (form.get('nif') as string).trim(),
      email: (form.get('email') as string).trim(),
      notes: (form.get('notes') as string).trim(),
      emailDomains,
      knownEmails,
    }

    setErrors({})
    startTransition(async () => {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json() as { error?: string; details?: Record<string, string[]> }

      if (!res.ok) {
        if (res.status === 422 && data.details) {
          setErrors(data.details as FormErrors)
        } else {
          setErrors({ general: data.error ?? 'Erro inesperado. Tente novamente.' })
        }
        return
      }

      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        aria-label="Editar cliente"
      >
        <Pencil className="h-3.5 w-3.5 stroke-[1.75]" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-dialog-title"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDialog}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 id="edit-dialog-title" className="text-[14px] font-bold text-gray-900">
                Editar cliente
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 stroke-[1.75]" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-4 px-5 py-4">
                {errors.general && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                    <p className="text-[12px] text-red-700" role="alert">{errors.general}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="edit-name" className="mb-1 block text-[12px] font-semibold text-slate-700">
                    Nome <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={firstInputRef}
                    id="edit-name"
                    name="name"
                    type="text"
                    required
                    defaultValue={client.name}
                    className={cn(
                      'w-full rounded-lg border bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2',
                      errors.name
                        ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                        : 'border-gray-200 focus:border-green-500 focus:ring-green-500/20',
                    )}
                  />
                  {errors.name && (
                    <p className="mt-1 text-[11px] text-red-600" role="alert">{errors.name[0]}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-nif" className="mb-1 block text-[12px] font-semibold text-slate-700">NIF</label>
                    <input
                      id="edit-nif"
                      name="nif"
                      type="text"
                      inputMode="numeric"
                      maxLength={9}
                      defaultValue={client.nif ?? ''}
                      placeholder="123456789"
                      className={cn(
                        'w-full rounded-lg border bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2',
                        errors.nif
                          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                          : 'border-gray-200 focus:border-green-500 focus:ring-green-500/20',
                      )}
                    />
                    {errors.nif && (
                      <p className="mt-1 text-[11px] text-red-600" role="alert">{errors.nif[0]}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="edit-email" className="mb-1 block text-[12px] font-semibold text-slate-700">Email principal</label>
                    <input
                      id="edit-email"
                      name="email"
                      type="email"
                      defaultValue={client.email ?? ''}
                      placeholder="geral@empresa.pt"
                      className={cn(
                        'w-full rounded-lg border bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2',
                        errors.email
                          ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                          : 'border-gray-200 focus:border-green-500 focus:ring-green-500/20',
                      )}
                    />
                    {errors.email && (
                      <p className="mt-1 text-[11px] text-red-600" role="alert">{errors.email[0]}</p>
                    )}
                  </div>
                </div>

                <TagInput
                  id="edit-emailDomains"
                  label="Domínios de email"
                  hint="Emails deste domínio serão associados automaticamente a este cliente."
                  placeholder="empresa.pt"
                  tags={emailDomains}
                  onAdd={(v) => setEmailDomains((p) => [...p, v])}
                  onRemove={(i) => setEmailDomains((p) => p.filter((_, idx) => idx !== i))}
                />

                <TagInput
                  id="edit-knownEmails"
                  label="Emails conhecidos"
                  hint="Endereços específicos que pertencem a este cliente."
                  placeholder="joao@empresa.pt"
                  tags={knownEmails}
                  onAdd={(v) => setKnownEmails((p) => [...p, v])}
                  onRemove={(i) => setKnownEmails((p) => p.filter((_, idx) => idx !== i))}
                  error={errors.knownEmails?.[0]}
                />

                <div>
                  <label htmlFor="edit-notes" className="mb-1 block text-[12px] font-semibold text-slate-700">Notas</label>
                  <textarea
                    id="edit-notes"
                    name="notes"
                    rows={2}
                    defaultValue={client.notes ?? ''}
                    placeholder="Observações internas..."
                    className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-slate-900 placeholder:text-gray-400 transition-colors focus:border-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={isPending}
                  className="h-8 cursor-pointer rounded-lg px-3 text-[12px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-green-600 px-4 text-[12px] font-bold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      A guardar...
                    </>
                  ) : (
                    'Guardar alterações'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
