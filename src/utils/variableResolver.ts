import { Environment } from '../types';

export interface VariableResolutionResult {
  resolved: string;
  missing: string[];
}

function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

export function resolveVariables(
  input: string,
  environment: Environment | undefined
): VariableResolutionResult {
  if (!environment) return { resolved: input, missing: [] };
  const varMap: Record<string, any> = {};
  environment.variables.forEach(v => {
    // Only include variables that are enabled
    if (v.enabled) {
      varMap[v.key] = v.currentValue;
    }
  });
  const missing: string[] = [];
  const resolved = input.replace(/{{\s*([\w.]+)\s*}}/g, (match, varName) => {
    const value = getValueByPath(varMap, varName);
    if (value === undefined) {
      missing.push(varName);
      return match;
    }
    return String(value);
  });
  return { resolved, missing };
}