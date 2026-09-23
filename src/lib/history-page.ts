export function decodeHistoryCursor(cursor?: string) {
 if (!cursor) return null;
 try {const [date,id]=JSON.parse(Buffer.from(cursor,'base64url').toString()) as [string,string]; if (typeof id!=='string'||Number.isNaN(new Date(date).getTime())) return null; return {date:new Date(date),id};} catch {return null;}
}
export function pageHistory<T extends {id:string;date:Date}>(rows:T[], cursor?:string, size=50) {
 const after=decodeHistoryCursor(cursor);
 const sorted=rows.filter(r=>!after||r.date<after.date||(r.date.getTime()===after.date.getTime()&&r.id<after.id)).sort((a,b)=>b.date.getTime()-a.date.getTime()||b.id.localeCompare(a.id));
 const items=sorted.slice(0,size);const last=items.at(-1);
 return {items,nextCursor: sorted.length>size&&last ? Buffer.from(JSON.stringify([last.date.toISOString(),last.id])).toString('base64url'):null};
}
