export function executeMock(registry, toolId, args) {
  const tool = registry.find(item => item.id === toolId);
  if (!tool) throw new Error('The selected tool is not in the enabled registry.');
  const parsed = tool.validator.safeParse(args);
  if (!parsed.success) throw new Error('Invalid tool arguments: ' + parsed.error.issues.map(item => `${item.path.join('.')}: ${item.message}`).join('; '));
  return tool.execute(parsed.data);
}
