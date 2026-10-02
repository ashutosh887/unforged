import { hrefOf } from "./router"
import { PageHead } from "./Site"

type Use = { title: string; signed: string; by: string; stops: string; state: "live" | "same" }

const uses: Use[] = [
  { title: "UPI payments", signed: "The bank's credit alert", by: "The seller's bank", stops: "One screenshot paying for two orders", state: "live" },
  { title: "Any signed email", signed: "Any email with a DKIM signature", by: "The sender's mail server", stops: "One email backing two claims", state: "live" },
  { title: "Refunds", signed: "The refund confirmation", by: "The marketplace or airline", stops: "One refund paid out twice", state: "same" },
  { title: "Payslips", signed: "The salary slip email", by: "The employer's payroll system", stops: "One payslip backing two loan applications", state: "same" },
  { title: "Rent receipts", signed: "The rent payment receipt", by: "The rent platform", stops: "One receipt in two tax claims", state: "same" },
  { title: "Expense claims", signed: "The merchant's bill email", by: "The merchant", stops: "One bill reimbursed twice", state: "same" },
  { title: "Booking deposits", signed: "The booking confirmation", by: "The hotel or airline", stops: "One deposit shown for two bookings", state: "same" },
]

export function UseCases() {
  return (
    <>
      <PageHead title="Where it goes" sub="Banks, employers, marketplaces and airlines already sign their emails. Each signed email can back one claim." />
      <ul className="cards three">
        {uses.map((u) => (
          <li key={u.title} className="card use">
            <div className="use-top">
              <h3>{u.title}</h3>
              <span className={`badge${u.state === "live" ? " live" : ""}`}>{u.state === "live" ? "Live" : "Same check"}</span>
            </div>
            <dl className="use-facts">
              <dt>Signed record</dt>
              <dd>{u.signed}</dd>
              <dt>Signed by</dt>
              <dd>{u.by}</dd>
              <dt>Claiming once stops</dt>
              <dd>{u.stops}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="note">
        "Same check" means you can claim the email once today on <a href={hrefOf.check}>Check an email</a>. Reading its amount or dates is the next build.
      </p>
    </>
  )
}
