export const requiredRoles=['implementation','regression','presentation'];
export function govern({before,after,results}){
 results=Array.isArray(results)?results:[];
 const reasons=[];
 if(!before||before!==after)reasons.push('Source changed during review. Rerun against one stable snapshot.');
 for(const role of requiredRoles){const matches=results.filter(r=>r.role===role);if(matches.length!==1){reasons.push(`Expected one ${role} report.`);continue;}const r=matches[0];if(r.snapshot!==before)reasons.push(`${role}: evidence belongs to a different snapshot.`);if(r.status!=='passed'||r.exitCode!==0)reasons.push(`${role}: checks did not pass.`);if(!Number.isInteger(r.checks)||r.checks<1)reasons.push(`${role}: no checks recorded.`);}
 return {decision:reasons.length?'needs-work':'approved-local-checks',reasons:reasons.length?reasons:['All required local specialists passed against the same unchanged source snapshot.'],scope:'Approval of these automated local checks only. AI critique, human sign-off, model quality and deployment authorization remain separate.'};
}
