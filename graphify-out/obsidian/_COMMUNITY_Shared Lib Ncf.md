---
type: community
members: 29
---

# Shared Lib Ncf

**Members:** 29 nodes

## Members
- [[DEFAULT_NCF_SEQUENCE]] - code - src/shared/lib/ncf.ts
- [[ECF_TO_LEGACY_MAP]] - code - src/shared/lib/ncf.ts
- [[LEGACY_TO_ECF_MAP]] - code - src/shared/lib/ncf.ts
- [[NCF_B_SEQUENCE_COLUMN_BY_CODE]] - code - src/shared/lib/ncf.ts
- [[NcfBSequenceColumn]] - code - src/shared/lib/ncf.ts
- [[NcfSequenceMap]] - code - src/shared/lib/ncf.ts
- [[buildBSequenceMap()]] - code - src/shared/lib/ncf.ts
- [[buildBSequenceMapFromRow()]] - code - src/shared/lib/ncf.ts
- [[buildDefaultBSequenceMap()]] - code - src/shared/lib/ncf.ts
- [[buildLocalTenantNcfReservation()]] - code - src/shared/lib/localFirst.ts
- [[buildNcfSequenceColumnsForSave()]] - code - src/shared/lib/ncf.ts
- [[buildNcfSequenceMapForSave()]] - code - src/shared/lib/ncf.ts
- [[buildTenantNcfUpdatePayload()]] - code - src/shared/lib/ncf.ts
- [[construirCadenaNcf()]] - code - src/shared/lib/ncf.ts
- [[esCodigoNcfValido()]] - code - src/shared/lib/ncf.ts
- [[etiquetaTipoNcf()]] - code - src/shared/lib/ncf.ts
- [[getExplicitBSequenceForType()]] - code - src/shared/lib/ncf.ts
- [[getNcfSequenceColumnName()]] - code - src/shared/lib/ncf.ts
- [[getNcfSequenceForType()]] - code - src/shared/lib/ncf.ts
- [[isNcfBCode()]] - code - src/shared/lib/ncf.ts
- [[ncf.test.ts]] - code - src/shared/lib/ncf.test.ts
- [[ncf.ts]] - code - src/shared/lib/ncf.ts
- [[ncfPayloadFromReservedSequence()]] - code - src/shared/lib/ncf.ts
- [[normalizeCode()]] - code - src/shared/lib/ncf.ts
- [[normalizeNcfActiveMap()]] - code - src/shared/lib/ncf.ts
- [[normalizeNcfSequenceMap()]] - code - src/shared/lib/ncf.ts
- [[parseValidNcfSequence()]] - code - src/shared/lib/ncf.ts
- [[prepareNcfForFacturaInsert()]] - code - src/shared/lib/ncf.ts
- [[reserveLocalNcfForNewInvoice()]] - code - src/shared/lib/localFirst.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Shared_Lib_Ncf
SORT file.name ASC
```

## Connections to other communities
- 29 edges to [[_COMMUNITY_Dashboard]]
- 16 edges to [[_COMMUNITY_Ajustes]]
- 9 edges to [[_COMMUNITY_Shared Lib Cloudavailability]]
- 8 edges to [[_COMMUNITY_Shared Lib Localfirst]]
- 3 edges to [[_COMMUNITY_Billing Invoiceslocal]]
- 2 edges to [[_COMMUNITY_Fiscal Activationpanel]]
- 1 edge to [[_COMMUNITY_Test Compras-crud]]
- 1 edge to [[_COMMUNITY_Gastos]]
- 1 edge to [[_COMMUNITY_Shared Lib Localfirst (localFirst)]]
- 1 edge to [[_COMMUNITY_Shared Lib Localfirst C75]]

## Top bridge nodes
- [[ncf.ts]] - degree 48, connects to 6 communities
- [[buildTenantNcfUpdatePayload()]] - degree 11, connects to 5 communities
- [[isNcfBCode()]] - degree 9, connects to 4 communities
- [[prepareNcfForFacturaInsert()]] - degree 12, connects to 3 communities
- [[buildBSequenceMapFromRow()]] - degree 6, connects to 3 communities