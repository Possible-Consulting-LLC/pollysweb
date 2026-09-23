import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('every exported mutation has an explicit context boundary before any action body', () => {
  const files = readdirSync(new URL('../../app/actions/', import.meta.url)).filter(x => x.endsWith('.ts') && !['care.ts', 'care-shared.ts', 'admin-test-session.ts'].includes(x));
  for (const file of files) {
    const text = source(`app/actions/${file}`), ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (!ts.isFunctionDeclaration(node) || !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) || !node.body || node.name?.text === 'logoutAction')
        continue;
      assert.match(node.body.getText(ast), /^\{\s*return withMutation\(/, `${file}:${node.name?.text}`);
    }
  }
});
test('photo reads and theme resolve effective identity', () => {
  assert.match(source('app/api/photos/route.ts'), /resolveRequestIdentity/);
  assert.match(source('app/layout.tsx'), /resolveRequestIdentity/);
});
test('settings hides account identity controls while testing as a demo', () => {
  const text = source('app/(app)/settings/page.tsx');
  assert.match(text, /requireUserContext/);
  assert.match(text, /const testingAs = Boolean\(identity\.testSessionId\)/);
  const identityGate = text.indexOf('{!testingAs ? <>');
  assert.ok(identityGate > text.indexOf('title="Plan"'));
  assert.ok(identityGate > text.indexOf('title="Profile"'));
  assert.ok(identityGate < text.indexOf('title="Change email"'));
  assert.match(text, /!testingAs\s*\?\s*<>[\s\S]*title="Change email"[\s\S]*title="Sign-in methods"[\s\S]*title="Password"[\s\S]*<\/>\s*:\s*<Card[\s\S]*Account sign-in settings are unavailable while testing as a demo/);
});
test('mutation forms render the authenticated context and direct callers carry it explicitly', () => {
  const direct = new Set(['deleteActivityAction', 'deletionPreviewAction', 'resumeAccountDeletionAction', 'startCheckoutAction', 'openBillingPortalAction', 'updatePremoltStatus', 'setSpiderProfilePhoto', 'deleteSpiderPhoto', 'restoreMemorializedSpider']);
  const walk = (url: URL): URL[] => readdirSync(url, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(new URL(`${entry.name}/`, url)) : entry.name.endsWith('.tsx') ? [new URL(entry.name, url)] : []);
  for (const url of [...walk(new URL('../../components/', import.meta.url)), ...walk(new URL('../../app/', import.meta.url))]) {
    if (url.pathname.endsWith('/components/mutation-form.tsx')) continue;
    const text = readFileSync(url, 'utf8');
    const ast = ts.createSourceFile(url.pathname, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function inspect(node: ts.Node) {
      if (ts.isJsxElement(node) && ['form', 'MutationForm'].includes(node.openingElement.tagName.getText(ast)) && node.openingElement.attributes.properties.some(p => ts.isJsxAttribute(p) && ['action', 'onSubmit'].includes(p.name.getText(ast)))) {
        const opening = node.openingElement.getText(ast);
        if (!opening.includes('stopTestSessionAction'))
          assert.ok(node.children.some(c => ts.isJsxSelfClosingElement(c) && c.tagName.getText(ast) === 'MutationContextInput'), url.pathname);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && direct.has(node.expression.text))
        assert.equal(node.arguments.at(-1)?.getText(ast), 'mutationContext', `${url.pathname}:${node.expression.text}`);
      ts.forEachChild(node, inspect);
    }
    inspect(ast);
  }
});
