import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const executiveCalendarScope='Synthetic, tentative, transparent single-task calendar snapshot. Actor labels are not authentication. No invitation, provider booking, notification, synchronization or cancellation is performed. A downloaded file cannot be recalled.';
const MEDIA='text/calendar;charset=utf-8',MAX_INTEGER=2147483647;
export class ExecutiveCalendarError extends Error{constructor(message,code='invalid_calendar'){super(message);this.name='ExecutiveCalendarError';this.code=code;}}
const fail=(message,code)=>{throw new ExecutiveCalendarError(message,code);};
function sourceHash(){try{return createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');}catch{fail('Calendar serializer source is unavailable. Restart with reviewed files.','stale');}}
const LOADED_SOURCE=sourceHash();
export function assertExecutiveCalendarFresh(){if(sourceHash()!==LOADED_SOURCE)fail('Calendar serializer changed after load. Restart before exporting.','stale');}
function text(value,label,max=2000){if(typeof value!=='string'||!value.trim()||value.length>max||!value.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail('Invalid calendar '+label+'.');return value;}
function id(value,label){text(value,label,100);if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value))fail('Invalid calendar '+label+'.');}
function integer(value,label){if(!Number.isSafeInteger(value)||value<1||value>MAX_INTEGER)fail('Calendar '+label+' must be a positive signed-32-bit integer.');}
function utc(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/u.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('Calendar dates require real canonical UTC whole-second instants.');return value.replace(/[-:]/gu,'').replace('.000','');}
const escapeText=value=>value.replace(/\\/gu,'\\\\').replace(/\r\n|\r|\n/gu,'\\n').replace(/,/gu,'\\,').replace(/;/gu,'\\;');
function fold(line){const physical=[];let current='',size=0;for(const point of line){const width=Buffer.byteLength(point,'utf8');if(size+width>75){physical.push(current);current=' ';size=1;}current+=point;size+=width;}physical.push(current);return physical.join('\r\n');}

/** Closed serialization only. The domain core separately authorizes the task snapshot. */
export function serializeExecutiveCalendar(value){
 assertExecutiveCalendarFresh();const fields=['tenant','caseId','revision','reviewHash','taskGeneration','sourceFixtureId','sourceVersion','actionText','start','end','recordedAt'];if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).length!==fields.length||fields.some(field=>!Object.hasOwn(value,field)))fail('Calendar serialization accepts only the closed task snapshot.');
 for(const field of ['tenant','caseId','sourceFixtureId'])id(value[field],field);for(const field of ['revision','taskGeneration','sourceVersion'])integer(value[field],field);if(typeof value.reviewHash!=='string'||! /^[a-f0-9]{64}$/u.test(value.reviewHash))fail('Invalid calendar review fingerprint.');text(value.actionText,'task label');const start=utc(value.start),end=utc(value.end),stamp=utc(value.recordedAt);if(Date.parse(value.end)<=Date.parse(value.start))fail('Calendar end must be after its start.');
 const uidHash=createHash('sha256').update(JSON.stringify([value.tenant,value.caseId])).digest('hex'),uid='ea-'+uidHash+'@portfolio.invalid';
 const logical=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Frosty9810//Synthetic Executive Calendar Snapshot v1//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+uid,'SEQUENCE:'+value.revision,'DTSTAMP:'+stamp,'DTSTART:'+start,'DTEND:'+end,'SUMMARY:'+escapeText('SYNTHETIC - '+value.actionText),'DESCRIPTION:'+escapeText('Synthetic local task snapshot only. Not an invitation or provider booking. Downloaded files cannot be recalled.'),'STATUS:TENTATIVE','TRANSP:TRANSPARENT','X-EXECUTIVE-TENANT:'+escapeText(value.tenant),'X-EXECUTIVE-CASE-ID:'+escapeText(value.caseId),'X-EXECUTIVE-SOURCE-ID:'+escapeText(value.sourceFixtureId),'X-EXECUTIVE-SOURCE-VERSION:'+value.sourceVersion,'X-EXECUTIVE-REVIEW-HASH:'+value.reviewHash,'X-EXECUTIVE-TASK-GENERATION:'+value.taskGeneration,'END:VEVENT','END:VCALENDAR'];
 const result={uid,sequence:value.revision,filename:'executive-'+uidHash.slice(0,24)+'-r'+value.revision+'.ics',mediaType:MEDIA,content:logical.map(fold).join('\r\n')+'\r\n'};assertExecutiveCalendarFresh();return result;
}