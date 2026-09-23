import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageHistory } from './history-page';
test('all history including equal timestamp boundaries is reachable',()=>{
 const rows = Array.from({length:123},(_,i)=>({id:String(i).padStart(3,'0'), date:new Date('2026-09-01')}));
 let cursor:string|undefined; const ids:string[]=[];
 do {const page=pageHistory(rows,cursor,50);ids.push(...page.items.map(x=>x.id));cursor=page.nextCursor??undefined;} while(cursor);
 assert.equal(ids.length,123);assert.equal(new Set(ids).size,123);
});
