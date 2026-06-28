import * as vscode from 'vscode';

class WardyProvider implements vscode.TreeDataProvider<{ label: string }> {
  getTreeItem(element: { label: string }): vscode.TreeItem {
    return {
      label: element.label,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        command: 'wardy.helloWorld',
        title: 'Hello World',
      },
    };
  }

  getChildren(): { label: string }[] {
    return [{ label: 'Click me' }];
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('wardy.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from wardy!');
  });

  vscode.window.registerTreeDataProvider('wardy.sidebar', new WardyProvider());

  context.subscriptions.push(disposable);
}

export function deactivate() {}
