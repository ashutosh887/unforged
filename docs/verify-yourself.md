# Verify it yourself

Every claim Unforged makes has a command behind it. You need Node.js 22 and
pnpm, and no AWS account. Every command below talks to the live stack.

```sh
git clone https://github.com/ashutosh887/unforged && cd unforged
pnpm install
export API_URL=https://d1ajauwkb76on3.cloudfront.net
```

Each measurement script prints a Markdown table and writes its raw JSON to
`measurements/`. Compare the output with [`measurements.md`](measurements.md).

## Is the stack healthy right now

```sh
curl -s $API_URL/api/status
```

`ok` is true when the sample email still verifies against the key gnu.org
publishes in DNS and Aurora DSQL answers. `keySha256` changes if gnu.org
rotates that key.

## Run the screenshot check on a throwaway shop

```sh
TOKEN=$(curl -s -X POST $API_URL/api/demo/shop | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
IMG=$(base64 < web/public/samples/upi-cropped.png | tr -d '\n')
curl -s -X POST $API_URL/api/check -H "x-shop-token: $TOKEN" -H 'content-type: application/json' \
  -d "{\"image\":\"$IMG\",\"orderRef\":\"A12\"}"
```

The cropped screenshot has no UTR, so the verdict is `UNREADABLE`. With
`upi-paid.png` it is `NOT_FOUND_YET`: the demo shop holds no bank alert.

## Check a signature with the public API

The API stores nothing on this route.

```sh
curl -s -X POST "$API_URL/api/verify" \
  -H 'content-type: application/json' \
  --data "$(node -e 'console.log(JSON.stringify({raw: require("fs").readFileSync("web/public/samples/sample.eml","utf8")}))')"
```

Expect `"signer":"gnu.org"` and one signature with `"result":"pass"`. Change
one letter in the body of a copy of the file and run it again. Expect
`"signer":null` and `"detail":"body hash did not verify"`.

## Recompute the body hash yourself

This is the same check the live page does in your browser. It hashes the
sample's body in the DKIM relaxed form and prints it next to the `bh=` the
sender signed.

```sh
node -e '
const fs=require("fs"),c=require("crypto");
const raw=fs.readFileSync("web/public/samples/sample.eml","utf8").replace(/\r?\n/g,"\r\n");
const i=raw.indexOf("\r\n\r\n");
let lines=raw.slice(i+4).split("\r\n").map(l=>l.replace(/[ \t]+/g," ").replace(/ $/,""));
while(lines.length&&lines[lines.length-1]==="")lines.pop();
console.log("computed", c.createHash("sha256").update(lines.join("\r\n")+"\r\n").digest("base64"));
console.log("signed  ", (raw.match(/bh=([^;]+)/)||[])[1].replace(/\s/g,""));'
```

## Claim an email once, then again

Use your own ledger name so earlier claims do not interfere.

```sh
L=check-$(date +%s)
for ref in "order 1" "order 2"; do
  curl -s -X POST "$API_URL/api/records/claim" -H 'content-type: application/json' \
    --data "$(node -e 'console.log(JSON.stringify({raw: require("fs").readFileSync("web/public/samples/sample.eml","utf8"), claimRef: process.argv[1], ledger: process.argv[2]}))' "$ref" "$L")"
  echo
done
```

Expect `VERIFIED` with a `receipt` id, then `ALREADY_CLAIMED` naming
"order 1".

## Verify a receipt offline

```sh
RECEIPT_ID=<id from the claim above> pnpm measure:receipt
```

The script fetches the receipt and the KMS public key named on it, then checks
the ECDSA signature and the chain hash locally with `node:crypto`. It also
edits one field and shows that both checks fail. The key route also serves retired
keys that signed a stored receipt, so older receipts check the same way.

## Audit a whole ledger

```sh
LEDGER=$L pnpm measure:chain
```

The script recomputes every hash, checks each link to the previous receipt and
verifies every signature. Expect 0 breaks.

## Rerun each measurement

| What | Command | Section |
|---|---|---|
| 50 claims of one bank credit at once, unique key against check-then-insert | `ROUNDS=20 N=50 pnpm measure:race` | §1 |
| The same credit claimed twice in a row | `ROUNDS=10 pnpm measure:replay` | §2 |
| 80 real signed emails, edited and re-addressed | `pnpm measure:signature` | §6 |
| Many simultaneous claims of one signed email | `ROUNDS=10 N=10 pnpm measure:record-race` (§7 also ran `N=50`) | §7 |
| Textract reads of the two demo screenshots | `ROUNDS=10 pnpm exec tsx scripts/read-samples.ts` | §8 |
| 32 receipts into one ledger, 8 at a time | `EML_DIR=<folder of .eml files> LIMIT=32 CONCURRENCY=8 pnpm measure:receipt-race` | §9 |
| DKIM key lookup time, from your machine | `DKIM_LOCAL=1 DKIM_DOMAIN=gnu.org DKIM_SELECTOR=fencepost-gnu-org pnpm measure:dkim` | §4 is still pending; this run is not recorded there |

Notes on these runs:

- The public Lambda route for DKIM timing was removed during hardening, so
  `measure:dkim` measures from your own machine with `DKIM_LOCAL=1`.
- The account's Lambda concurrency limit is 1,000. It was 10 when the §7 runs
  were made, which is why they show HTTP 503s.
- `measure:receipt-race` needs a folder of signed `.eml` files and reads the
  first 24 unless `LIMIT` is set. The archive used in §6 and §7 is public at
  `https://lists.gnu.org/archive/mbox/help-gnu-emacs/2026-09`.

## Run the tests

```sh
pnpm check
```

This typechecks `src`, `infra` and `web`, then runs every test in `test/`.
