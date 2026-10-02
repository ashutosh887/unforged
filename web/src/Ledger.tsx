import { PageHead } from "./Site"

export const auditedLedger = "chain-1790930647118"

export function Ledger({ ledger, visitLedger }: { ledger?: string | undefined; visitLedger?: string | undefined }) {
  const shown = ledger ?? auditedLedger
  return (
    <>
      <PageHead title="Ledger" sub="Every verified claim gets a receipt signed by AWS KMS. Each receipt hashes the one before it, so editing any entry breaks the chain." />
      <section className="ledger" data-ledger={shown} aria-label="Receipt chain">
        <p className="muted">
          Ledger <code className="hex">{shown}</code>
          {shown === auditedLedger && ", the 32 receipts audited on 2 Oct"}
        </p>
        {visitLedger && visitLedger !== shown && (
          <p>
            <a className="text" href={`#/ledger/${visitLedger}`}>
              Open this visit's ledger
            </a>
          </p>
        )}
      </section>
    </>
  )
}
