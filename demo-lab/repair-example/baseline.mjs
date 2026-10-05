// Known-bug fixture: repeated delivery events deduct stock twice.
export function receive(events, stock=20){
 for(const event of events) stock-=event.quantity;
 return stock;
}
