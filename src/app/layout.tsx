import type { Metadata } from 'next';
import './globals.css';
import fs from 'fs';

export const metadata: Metadata = {
  title: 'MAESTRA Monitor',
  description: 'Live monitoring and control interface for distributed installations built on Jordan Snyder\'s Maestra framework.',
};

function getTree(): string {
  try {
    const raw = fs.readFileSync('/tmp/maestra-tops.json', 'utf8');
    const store = JSON.parse(raw);
    // Merge all trees
    const tree: Record<string, string[]> = {};
    Object.values(store).forEach((s: unknown) => {
      const t = (s as Record<string,unknown>).tree as Record<string,string[]>|undefined;
      if (t) Object.entries(t).forEach(([k,v]) => { tree[k] = v; });
    });
    return JSON.stringify(tree);
  } catch { return '{}'; }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const treeJson = getTree();
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `window.__MAESTRA_TREE__=${treeJson};` }} />
      </head>
      <body>
        <div className="shimmer-bg" />
        {children}
      </body>
    </html>
  );
}
