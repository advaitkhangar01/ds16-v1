const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '..', 'server', 'routes');
const files = fs.readdirSync(routesDir);

const routeMapping = {
  'auth.js': '/api/auth',
  'attendance.js': '/api/attendance',
  'projects.js': '/api/projects',
  'dashboard.js': '/api/dashboard',
  'vendors.js': '/api/vendors',
  'clients.js': '/api/clients',
  'documents.js': '/api/documents',
  'tasks.js': '/api/tasks',
  'settings.js': '/api/settings',
  'finances.js': '/api/finances',
  'accounting.js': '/api/accounting',
  'invoices.js': '/api/invoices',
  'monthlyClose.js': '/api/monthly-close',
  'leaves.js': '/api/leaves',
  'reports.js': '/api/reports',
  'staff.js': '/api/staff'
};

let output = '';
output += '| File | Method | Base Path | Route | Full API Path | Line | Description/Context |\n';
output += '| --- | --- | --- | --- | --- | --- | --- |\n';

files.forEach(file => {
  if (!file.endsWith('.js')) return;
  
  const filePath = path.join(routesDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const baseRoute = routeMapping[file] || `/api/${file.replace('.js', '')}`;
  
  lines.forEach((line, index) => {
    // Look for router.get, router.post, router.put, router.delete, router.patch
    const match = line.match(/router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/);
    if (match) {
      const method = match[1].toUpperCase();
      const subPath = match[2];
      const fullPath = (baseRoute + (subPath === '/' ? '' : subPath)).replace(/\/+/g, '/');
      const lineNum = index + 1;
      
      // Let's grab context comments right before this line
      let comments = [];
      for (let i = index - 1; i >= Math.max(0, index - 3); i--) {
        const prevLine = lines[i].trim();
        if (prevLine.startsWith('//')) {
          comments.unshift(prevLine.replace(/^\/\/\s*/, ''));
        } else {
          break;
        }
      }
      const desc = comments.join(' ') || 'N/A';
      
      output += `| [${file}](file:///d:/Freelance/ds16-v1/server/routes/${file}#L${lineNum}) | **${method}** | \`${baseRoute}\` | \`${subPath}\` | \`${fullPath}\` | ${lineNum} | ${desc} |\n`;
    }
  });
});

fs.writeFileSync(path.join(__dirname, 'routes_output.md'), output);
console.log('Successfully wrote routes to scratch/routes_output.md');
