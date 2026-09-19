import { toolNames, toolInfo, type ToolName } from '../types.js';
export function createToolbar(root: HTMLElement) {
  const icons = ['◎', '↺', '?', '✥'];
  toolNames.forEach((name, i) => { const item = document.createElement('span'); item.className = 'tool-chip'; item.dataset.tool = name; item.innerHTML = `<b aria-hidden="true">${icons[i]}</b>${toolInfo[name].label}`; root.append(item); });
  return (tool: ToolName | null) => root.querySelectorAll<HTMLElement>('[data-tool]').forEach(el => { el.classList.toggle('active', el.dataset.tool === tool); });
}
