export const constructionScope = 'CON-01 partial synthetic local ledger. Fixture actor labels are not authentication. Manual source manifests are not parsed PDFs or verified issuers. Readiness is a local checklist, not site-work authorization; commitments are not payments or real contracts.';
export const constructionAsOf = '2026-10-24T12:00:00.000Z';
export const constructionRegistry = Object.fromEntries(['acme','beta'].map(tenant=>[tenant,{
  site:{id:`site-${tenant}`,tenant,title:`Synthetic ${tenant} refurbishment`,currency:'USD',budgetCents:1000000,subcontractorId:`sub-${tenant}`,activeFrom:'2026-01-01T00:00:00.000Z',activeUntil:'2027-01-01T00:00:00.000Z'},
  actors:{operators:[`${tenant}-operator`,`${tenant}-dual-role`],compliance:[`${tenant}-compliance`,`${tenant}-dual-role`],projectManagers:[`${tenant}-manager`,`${tenant}-dual-role`],finance:[`${tenant}-finance`,`${tenant}-dual-role`]}
}]));
const doc=(tenant,kind,channel='pdf-manifest')=>({commandId:`document-${tenant}-${kind}`,tenant,actor:`${tenant}-operator`,siteId:`site-${tenant}`,subcontractorId:`sub-${tenant}`,kind,sourceId:`source-${tenant}-${kind}`,channel,reference:`Fictional ${kind} attachment supplied for local review`,content:`SYNTHETIC ${tenant} ${kind} manifest; manually supplied fields, not issuer evidence.`,receivedAt:'2026-10-24T10:00:00.000Z',validUntil:'2026-12-01T00:00:00.000Z'});
export const constructionDocumentExamples=[
 {id:'insurance',title:'Synthetic insurance manifest',input:doc('acme','insurance')},
 {id:'license',title:'Synthetic license email',input:doc('acme','license','email')},
 {id:'expired-insurance',title:'Expired historical insurance manifest',input:{...doc('acme','insurance'),commandId:'expired-document',sourceId:'expired-source',receivedAt:'2026-10-01T10:00:00.000Z',validUntil:'2026-10-20T00:00:00.000Z'}},
 {id:'beta-insurance',title:'Separate tenant insurance manifest',input:doc('beta','insurance')},
 {id:'beta-license',title:'Separate tenant license manifest',input:doc('beta','license')}
];
const order=tenant=>({commandId:`order-${tenant}`,tenant,actor:`${tenant}-operator`,siteId:`site-${tenant}`,subcontractorId:`sub-${tenant}`,sourceIssueId:`change-${tenant}-001`,scope:'Replace the fictional damaged service conduit.',amountCents:125000,scheduleImpactDays:2,channel:'email',reference:'Synthetic email CHG-001, manually entered',content:'Fictional foreman requests conduit replacement; USD1250.00 and two days supplied for review.',receivedAt:'2026-10-24T11:00:00.000Z'});
export const constructionOrderExamples=[{id:'routine-change',title:'Conduit replacement change',input:order('acme')},{id:'over-budget',title:'Change exceeds the local remaining budget',input:{...order('acme'),commandId:'large-order',sourceIssueId:'large-change',amountCents:1100000}},{id:'beta-change',title:'Separate tenant change',input:order('beta')}];
