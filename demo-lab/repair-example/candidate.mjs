// Original candidate written with Codex assistance. No Codex SDK call.
export function receive(events, stock=20){
 const seen=new Map();
 for(const event of events){
  if(typeof event.id!=='string'||!event.id.trim()||!Number.isInteger(event.quantity)||event.quantity<=0)throw Error('Invalid event');
  if(seen.has(event.id)){
   if(seen.get(event.id)!==event.quantity)throw Error('Conflicting event');
   continue;
  }
  if(event.quantity>stock)throw Error('Insufficient stock');
  seen.set(event.id,event.quantity);stock-=event.quantity;
 }
 return stock;
}
