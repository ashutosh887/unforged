export const demoBank = "demo"

export function bankLabel(bank: string, dkimDomain: string): string {
  return bank === demoBank ? `Demo bank (${dkimDomain}), not a real bank` : bank.toUpperCase()
}
