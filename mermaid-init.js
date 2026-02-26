import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

document.querySelectorAll('pre > code.language-mermaid').forEach((code) => {
  const pre = code.parentElement;
  const div = document.createElement('div');
  div.className = 'mermaid';
  div.textContent = code.textContent;
  pre.replaceWith(div);
});

mermaid.run();
