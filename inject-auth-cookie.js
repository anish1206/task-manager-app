const fs = require('fs');

function inject(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/request\(app\)\.(get|post|put|patch|delete)\((.*?)\)/g, "request(app).$1($2).set('Cookie', authCookie)");
  fs.writeFileSync(file, content);
}

inject('server/tests/tasks.test.mjs');
inject('server/tests/integration.test.mjs');
console.log('Injected auth cookie into tests');
