import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

/** Lexical regression only: this does not parse or execute PostgreSQL/PLpgSQL.
 * Ignore quoted literals/identifiers and comments; dollar bodies must use matching
 * valid delimiters. In particular JS replacement strings must not collapse $$.
 */
function assertDollarQuotes(sql:string) {
 let bodies=0;
 for(let i=0;i<sql.length;) {
  if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end+1;continue;}
  if(sql.startsWith('/*',i)){const end=sql.indexOf('*/',i+2);assert.notEqual(end,-1,'Unterminated SQL comment');i=end+2;continue;}
  if(sql[i]==="'" || sql[i]==='"') {
   const quote=sql[i++];
   while(i<sql.length){if(sql[i++]===quote){if(sql[i]===quote){i++;continue;}break;}}
   continue;
  }
  if(sql[i]==='$') {
   const delimiter=/^(?:\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/.exec(sql.slice(i))?.[0];
   assert.ok(delimiter,`Invalid SQL dollar delimiter at offset ${i}`);
   const end=sql.indexOf(delimiter,i+delimiter.length);
   assert.notEqual(end,-1,`Unmatched SQL dollar delimiter ${delimiter} at offset ${i}`);
   i=end+delimiter.length;bodies++;continue;
  }
  i++;
 }
 return bodies;
}
test('authored foundation and deletion function/DO bodies have matching valid dollar quotes',()=>{
 const sql=readFileSync(new URL('../../../prisma/migrations/20260921010000_admin_foundations/migration.sql',import.meta.url),'utf8');
 assert.ok(assertDollarQuotes(sql)>0);
});
test('dollar-quote guard detects collapsed and mismatched function/DO delimiters',()=>{
 for(const sql of ['CREATE FUNCTION f() RETURNS void AS $ BEGIN END; $;', 'DO $$ BEGIN END; $;', 'DO $body$ BEGIN END; $wrong$;'])assert.throws(()=>assertDollarQuotes(sql),/dollar delimiter/);
 assert.equal(assertDollarQuotes("-- $ comment\nDO $body$ BEGIN RAISE NOTICE '$'; END; $body$; SELECT '$', \"$\";"),1);
});

test('cumulative unapplied foundations migration commits once after all deletion guards',()=>{
 const sql=readFileSync(new URL('../../../prisma/migrations/20260921010000_admin_foundations/migration.sql',import.meta.url),'utf8');
 const withoutComments=sql.replace(/--[^\n]*/g,'').trim();
 assert.match(withoutComments,/^BEGIN;/);
 assert.match(withoutComments,/COMMIT;$/);
 assert.equal((sql.match(/^BEGIN;$/gm)??[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)??[]).length,1);
 assert.ok(sql.indexOf('COMMIT;')>sql.indexOf('CREATE TRIGGER block_unconfirmed_user_delete'));
});

test('all new internal tables explicitly revoke PUBLIC privileges',()=>{
 const sql=readFileSync(new URL('../../../prisma/migrations/20260921010000_admin_foundations/migration.sql',import.meta.url),'utf8');
 for(const table of ['ProtectedOwner','AdminAudit','AdminReauth','AccountDeletionOperation','OwnedUpload','BillingCheckoutIntent','AdminTestSession','SiteSettings']) {
  assert.match(sql,new RegExp(`REVOKE ALL ON(?: TABLE)? [^;]*"${table}"[^;]* FROM PUBLIC(?:[;,])`),table);
 }
});

test('pending email verification is explicitly private in the migration chain',()=>{
 const sql=readFileSync(new URL('../../../prisma/migrations/20260923010000_harden_pending_email_verification/migration.sql',import.meta.url),'utf8');
 assert.match(sql,/ALTER TABLE\s+"PendingEmailVerification"\s+ENABLE ROW LEVEL SECURITY;/);
 assert.match(sql,/REVOKE ALL ON TABLE\s+"PendingEmailVerification"\s+FROM PUBLIC, anon, authenticated;/);
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP)\b/i);
});
