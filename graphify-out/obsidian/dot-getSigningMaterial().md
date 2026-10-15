---
source_file: "worker/fiscal/certificateCustody.ts"
type: "code"
community: "Fiscal Certificatecustody"
location: "L19"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Fiscal_Certificatecustody
---

# .getSigningMaterial()

## Connections
- [[SigningMaterial]] - `references` [EXTRACTED]
- [[SupabaseStorageCertificateCustody]] - `method` [EXTRACTED]
- [[WorkerResult]] - `references` [EXTRACTED]
- [[decryptPassphrase()]] - `calls` [EXTRACTED]
- [[fiscalWorkerError()]] - `calls` [EXTRACTED]
- [[resolveRequiredEcfEncryptionKey()]] - `calls` [EXTRACTED]
- [[unknownToWorkerError()]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Fiscal_Certificatecustody