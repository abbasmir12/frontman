import * as vscode from 'vscode';
import { Environment, EnvironmentState } from '../types';

const ENVIRONMENTS_KEY = 'apiSidebar.environments';
const SELECTED_ENV_KEY = 'apiSidebar.selectedEnvironmentId';

export class EnvironmentStore {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async getState(): Promise<EnvironmentState> {
    const environments = this.context.globalState.get<Environment[]>(ENVIRONMENTS_KEY, []);
    const selectedEnvironmentId = this.context.globalState.get<string>(SELECTED_ENV_KEY);
    return { environments, selectedEnvironmentId };
  }

  async saveState(state: EnvironmentState): Promise<void> {
    await this.context.globalState.update(ENVIRONMENTS_KEY, state.environments);
    await this.context.globalState.update(SELECTED_ENV_KEY, state.selectedEnvironmentId);
  }

  async getEnvironments(): Promise<Environment[]> {
    return this.context.globalState.get<Environment[]>(ENVIRONMENTS_KEY, []);
  }

  async saveEnvironments(environments: Environment[]): Promise<void> {
    await this.context.globalState.update(ENVIRONMENTS_KEY, environments);
  }

  async getSelectedEnvironmentId(): Promise<string | undefined> {
    return this.context.globalState.get<string>(SELECTED_ENV_KEY);
  }

  async setSelectedEnvironmentId(id: string): Promise<void> {
    await this.context.globalState.update(SELECTED_ENV_KEY, id);
  }
} 