import { Environment, EnvironmentVariable, EnvironmentState } from '../types';
import { EnvironmentStore } from './EnvironmentStore';

// Simple UUID v4 generator (not cryptographically secure)
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class EnvironmentManager {
  [x: string]: any;
  private store: EnvironmentStore;
  private state: EnvironmentState = { environments: [], selectedEnvironmentId: undefined };

  constructor(store: EnvironmentStore) {
    this.store = store;
  }

  async load(): Promise<void> {
    this.state = await this.store.getState();
  }

  getEnvironments(): Environment[] {
    return this.state.environments;
  }

  getSelectedEnvironment(): Environment | undefined {
    return this.state.environments.find(e => e.id === this.state.selectedEnvironmentId);
  }

  async setActiveEnvironment(id: string): Promise<void> {
    this.state.selectedEnvironmentId = id;
    await this.store.setSelectedEnvironmentId(id);
  }

  async createEnvironment(name: string): Promise<Environment> {
    const env: Environment = {
      id: uuidv4(),
      name,
      variables: [],
      lastModified: Date.now(),
    };
    this.state.environments.push(env);
    await this.store.saveEnvironments(this.state.environments);
    return env;
  }

  async updateEnvironment(id: string, variables: EnvironmentVariable[], name?: string): Promise<void> {
    const env = this.state.environments.find(e => e.id === id);
    if (env) {
      // Ensure variables have the correct structure
      env.variables = variables.map(v => ({
        id: v.id,
        key: v.key,
        initialValue: v.initialValue || '',
        currentValue: v.currentValue || v.initialValue || '',
        type: v.type || 'default',
        enabled: v.enabled !== undefined ? v.enabled : true
      }));
      if (name) env.name = name;
      env.lastModified = Date.now();
      await this.store.saveEnvironments(this.state.environments);
    }
  }

  async deleteEnvironment(id: string): Promise<void> {
    this.state.environments = this.state.environments.filter(e => e.id !== id);
    if (this.state.selectedEnvironmentId === id) {
      this.state.selectedEnvironmentId = this.state.environments[0]?.id;
      await this.store.setSelectedEnvironmentId(this.state.selectedEnvironmentId!);
    }
    await this.store.saveEnvironments(this.state.environments);
  }


  async renameEnvironment(id: string, newName: string): Promise<void> {
    const env = this.state.environments.find(e => e.id === id);
    if (env) {
      env.name = newName;
      env.lastModified = Date.now();
      await this.store.saveEnvironments(this.state.environments);
    }
  }

  async importEnvironments(json: string): Promise<void> {
    let imported: Environment[] = [];
    try {
      imported = JSON.parse(json);
      // Ensure unique IDs and names
      imported.forEach(env => {
        env.id = uuidv4();
        env.name = env.name + ' (Imported)';
        env.lastModified = Date.now();
      });
      this.state.environments.push(...imported);
      await this.store.saveEnvironments(this.state.environments);
    } catch (e) {
      throw new Error('Invalid JSON for import');
    }
  }

  async exportEnvironments(ids?: string[]): Promise<string> {
    const envs = ids ? this.state.environments.filter(e => ids.includes(e.id)) : this.state.environments;
    return JSON.stringify(envs, null, 2);
  }

  async cloneEnvironment(id: string, newName: string): Promise<Environment | undefined> {
    const env = this.state.environments.find(e => e.id === id);
    if (!env) return;
    
    const clone: Environment = {
      ...env,
      id: uuidv4(),
      name: newName,
      lastModified: Date.now(),
      variables: env.variables.map(v => ({
        ...v,
        id: uuidv4() // Generate new IDs for variables too
      }))
    };
    
    this.state.environments.push(clone);
    await this.store.saveEnvironments(this.state.environments);
    return clone;
  }

  async updateVariable(envId: string, varId: string, variable: EnvironmentVariable): Promise<void> {
    const env = this.state.environments.find(e => e.id === envId);
    if (!env) return;
    const idx = env.variables.findIndex(v => v.id === varId);
    if (idx !== -1) {
      env.variables[idx] = variable;
      env.lastModified = Date.now();
      await this.store.saveEnvironments(this.state.environments);
    }
  }

  async addVariable(envId: string, variable: EnvironmentVariable): Promise<void> {
    const env = this.state.environments.find(e => e.id === envId);
    if (!env) return;
    env.variables.push(variable);
    env.lastModified = Date.now();
    await this.store.saveEnvironments(this.state.environments);
  }

  async deleteVariable(envId: string, varId: string): Promise<void> {
    const env = this.state.environments.find(e => e.id === envId);
    if (!env) return;
    env.variables = env.variables.filter(v => v.id !== varId);
    env.lastModified = Date.now();
    await this.store.saveEnvironments(this.state.environments);
  }
}