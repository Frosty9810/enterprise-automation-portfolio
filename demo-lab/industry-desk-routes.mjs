export const industryDeskDefinitions = Object.freeze({
  'LEGAL-01': Object.freeze({slug:'legal',factory:'legalDesk'}),
  'INS-01': Object.freeze({slug:'insurance',factory:'insuranceDesk'}),
  'EA-01': Object.freeze({slug:'executive',factory:'executiveDesk'}),
});
export function industryDeskRoute(collection,id){
  return collection==='automation'&&Object.hasOwn(industryDeskDefinitions,id)
    ? `/industry/${industryDeskDefinitions[id].slug}?project=${encodeURIComponent(id)}` : null;
}
